-- Tow Connect: iPhone check-in support
-- Run this AFTER 20261020000000_init.sql, once, in the Supabase SQL Editor.
--
-- Why a new file instead of editing the first one: your Supabase project already ran the first
-- migration. Migrations are a history of changes, applied in order, so a database that ran file 1
-- only needs file 2. Editing file 1 would never reach a database that already has it.
--
-- What this adds:
--   1. A personal check-in code for each operator, so an iPhone Shortcuts automation can send the
--      operator's location without signing in (stored only as a hash, replaceable any time).
--   2. checkin(code, lat, lng): the one function that code is allowed to call.
--   3. A 30-minute freshness window instead of 10, because iPhone positions arrive at moments
--      (opening Maps, getting in the truck) rather than every minute.
--   4. Automatic "offline" after 3 hours without a position instead of 30 minutes, so an operator
--      who was quiet for a while comes back on the map at their next check-in.

-- ---------------------------------------------------------------------------
-- 1. Check-in codes
-- ---------------------------------------------------------------------------

-- One row per operator. We store a SHA-256 hash of the code, never the code itself, the same way
-- websites store password hashes: if this table ever leaked, the codes still couldn't be used.
create table public.operator_checkin_codes (
  operator_id  uuid primary key references public.operators (id) on delete cascade,
  code_hash    bytea not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.operator_checkin_codes enable row level security;
revoke all on public.operator_checkin_codes from anon;

-- Operators may see when their code was made and last used (not the code; it isn't stored).
create policy "checkin codes: owner or admin can read"
  on public.operator_checkin_codes for select to authenticated
  using (public.owns_operator(operator_id) or public.is_admin());

create or replace function public.hash_checkin_code(p_code text)
returns bytea
language sql immutable
as $$
  select sha256(convert_to(p_code, 'UTF8'));
$$;

-- Makes a new code for the signed-in operator and returns it. This is the ONLY time the code is
-- visible: the app shows it once for the operator to paste into the shortcut. Calling this again
-- replaces the old code, so a lost or shared code can be cancelled by making a new one.
create or replace function public.create_checkin_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_operator_id uuid;
  v_code text;
begin
  select id into v_operator_id from public.operators where user_id = auth.uid();
  if v_operator_id is null then
    raise exception 'Create your operator profile first.';
  end if;

  -- Two random UUIDs, dashes removed: 64 hex characters from Postgres's secure random generator.
  v_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.operator_checkin_codes (operator_id, code_hash)
  values (v_operator_id, public.hash_checkin_code(v_code))
  on conflict (operator_id) do update
    set code_hash = excluded.code_hash, created_at = now(), last_used_at = null;

  return v_code;
end;
$$;

-- Turns check-ins off entirely for the signed-in operator.
create or replace function public.delete_checkin_code()
returns void
language sql security definer set search_path = public
as $$
  delete from public.operator_checkin_codes c
  using public.operators o
  where o.id = c.operator_id and o.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. checkin(): called by the iPhone shortcut with the public key, no sign-in
-- ---------------------------------------------------------------------------

-- Returns a short JSON answer the shortcut can show if something is wrong:
--   { "ok": true,  "message": "Location updated" }
--   { "ok": false, "message": "You're offline in Tow Connect. Open the app and tap Go Available." }
-- It never says whether a code exists for someone else; a wrong code just gets "not recognized".
create or replace function public.checkin(
  p_code     text,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_op   public.operators%rowtype;
  v_last timestamptz;
begin
  if p_code is null or length(p_code) <> 64 then
    return jsonb_build_object('ok', false, 'message', 'Check-in code not recognized. Make a new one in the Tow Connect app.');
  end if;

  select o.* into v_op
  from public.operator_checkin_codes c
  join public.operators o on o.id = c.operator_id
  where c.code_hash = public.hash_checkin_code(p_code);

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Check-in code not recognized. Make a new one in the Tow Connect app.');
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'message', 'The location was missing. Check that Shortcuts can use your location.');
  end if;

  update public.operator_checkin_codes set last_used_at = now() where operator_id = v_op.id;

  -- Going Available stays a deliberate choice in the app; the shortcut only updates WHERE you are.
  if v_op.status <> 'approved' then
    return jsonb_build_object('ok', false, 'message', 'Your Tow Connect account is not approved right now.');
  end if;
  if not v_op.is_available then
    return jsonb_build_object('ok', false, 'message', 'You''re offline in Tow Connect. Open the app and tap Go Available.');
  end if;

  -- Several automations can fire within seconds (open Maps, then the dispatch app). One write is enough.
  select updated_at into v_last from public.operator_positions where operator_id = v_op.id;
  if v_last is not null and v_last > now() - interval '15 seconds' then
    return jsonb_build_object('ok', true, 'message', 'Location updated');
  end if;

  insert into public.operator_positions (operator_id, lat, lng, accuracy_m)
  values (v_op.id, p_lat, p_lng, case when p_accuracy >= 0 then p_accuracy end)
  on conflict (operator_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m;

  return jsonb_build_object('ok', true, 'message', 'Location updated');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Freshness window: 30 minutes (was 10)
-- Same function as in the first migration; only the interval in "eligible" changed.
-- ---------------------------------------------------------------------------

create or replace function public.nearby_operators(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 40,
  p_limit     integer default 30
)
returns table (
  id             uuid,
  company_name   text,
  phone          text,
  jurisdiction   text,
  license_number text,
  usdot_number   text,
  services       text[],
  truck_types    text[],
  hookup_fee     numeric,
  per_mile_rate  numeric,
  rate_notes     text,
  approx_lat     double precision,
  approx_lng     double precision,
  distance_km    double precision,
  position_age_s integer,
  is_demo        boolean
)
language sql stable security definer set search_path = public
as $$
  with params as (
    select
      greatest(-90.0, least(90.0, p_lat))    as lat,
      greatest(-180.0, least(180.0, p_lng))  as lng,
      greatest(1.0, least(100.0, coalesce(p_radius_km, 40))) as radius,
      greatest(1, least(50, coalesce(p_limit, 30))) as lim
  ),
  eligible as (
    select
      o.*,
      round(pos.lat::numeric, 2)::double precision as alat,
      round(pos.lng::numeric, 2)::double precision as alng,
      pos.updated_at as pos_at
    from public.operators o
    join public.operator_positions pos on pos.operator_id = o.id
    where o.status = 'approved'
      and o.is_available
      and (pos.updated_at > now() - interval '30 minutes' or o.is_demo)
      and exists (
        select 1 from public.operator_documents d
        where d.operator_id = o.id and d.kind = 'tow_license' and d.verified
          and (d.expires_on is null or d.expires_on >= current_date)
      )
      and exists (
        select 1 from public.operator_documents d
        where d.operator_id = o.id and d.kind = 'insurance' and d.verified
          and (d.expires_on is null or d.expires_on >= current_date)
      )
  )
  select
    e.id, e.company_name, e.phone, e.jurisdiction, e.license_number, e.usdot_number,
    e.services,
    coalesce((select array_agg(distinct t.type::text) from public.trucks t where t.operator_id = e.id), array[]::text[]),
    e.hookup_fee, e.per_mile_rate, e.rate_notes,
    e.alat, e.alng,
    round(d.km::numeric, 2)::double precision,
    greatest(0, extract(epoch from now() - e.pos_at))::integer,
    e.is_demo
  from eligible e
  cross join params p
  cross join lateral (
    select 2 * 6371 * asin(least(1.0, sqrt(
      power(sin(radians(e.alat - p.lat) / 2), 2)
      + cos(radians(p.lat)) * cos(radians(e.alat)) * power(sin(radians(e.alng - p.lng) / 2), 2)
    ))) as km
  ) d
  where d.km <= p.radius
  order by d.km
  limit (select lim from params);
$$;

-- ---------------------------------------------------------------------------
-- 4. Automatic offline after 3 hours without a position (was 30 minutes)
-- Between 30 minutes and 3 hours the operator is hidden from drivers but still "Available",
-- so their next check-in puts them straight back on the map.
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_availability()
returns integer
language sql security definer set search_path = public
as $$
  with changed as (
    update public.operators o
    set is_available = false
    where o.is_available
      and not o.is_demo
      and coalesce(o.available_since, now()) < now() - interval '3 hours'
      and not exists (
        select 1 from public.operator_positions p
        where p.operator_id = o.id and p.updated_at > now() - interval '3 hours'
      )
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.create_checkin_code() from public, anon;
revoke all on function public.delete_checkin_code() from public, anon;
revoke all on function public.checkin(text, double precision, double precision, double precision) from public;
revoke all on function public.hash_checkin_code(text) from public, anon;
revoke all on function public.expire_stale_availability() from public, anon, authenticated;

grant execute on function public.create_checkin_code() to authenticated;
grant execute on function public.delete_checkin_code() to authenticated;
grant execute on function public.checkin(text, double precision, double precision, double precision) to anon, authenticated;
