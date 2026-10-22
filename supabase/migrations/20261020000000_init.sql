-- Tow Connect: initial schema
-- Run this whole file once in the Supabase SQL Editor (or with `supabase db push`).
-- Maps to SRS sections 5 (class diagram), 6 (functional requirements), 7 (NFRs) and 8 (legal).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.operator_status as enum ('pending', 'approved', 'suspended');
create type public.truck_type      as enum ('flatbed', 'wheel_lift', 'heavy_duty');
create type public.document_kind   as enum ('tow_license', 'insurance', 'usdot', 'other');
create type public.report_reason   as enum ('overcharged', 'no_show', 'unsafe', 'unlicensed', 'solicitation', 'other');
create type public.report_status   as enum ('open', 'resolved');

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- True for the SQL editor, migrations and the service-role key; false for app users.
-- Must stay SECURITY INVOKER so current_user is the real caller.
create or replace function public.is_privileged()
returns boolean
language sql stable
as $$
  select current_user not in ('anon', 'authenticated') or public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Operators (includes the rate card: one-to-one, so kept on the same row)
-- ---------------------------------------------------------------------------

create table public.operators (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete cascade,
  company_name    text not null check (char_length(company_name) between 2 and 120),
  contact_name    text check (char_length(contact_name) <= 120),
  phone           text not null check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
  license_number  text not null check (char_length(license_number) between 2 and 60),
  usdot_number    text check (char_length(usdot_number) <= 20),
  jurisdiction    text not null default 'DC' check (jurisdiction in ('DC', 'MD', 'VA')),
  status          public.operator_status not null default 'pending',
  is_available    boolean not null default false,
  available_since timestamptz,
  services        text[] not null default '{}',
  hookup_fee      numeric(8, 2) check (hookup_fee >= 0),
  per_mile_rate   numeric(8, 2) check (per_mile_rate >= 0),
  rate_notes      text check (char_length(rate_notes) <= 280),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Operators can edit their own profile, but never their own approval status (FR-O3).
create or replace function public.operators_guard()
returns trigger
language plpgsql
as $$
declare
  v_priv boolean := public.is_privileged();
begin
  if tg_op = 'INSERT' then
    if not v_priv then
      new.user_id      := auth.uid();
      new.status       := 'pending';
      new.is_available := false;
      new.is_demo      := false;
    end if;
  else
    if not v_priv then
      new.user_id := old.user_id;
      new.status  := old.status;
      new.is_demo := old.is_demo;
      -- Once approved, the license number can only change through an admin.
      if old.status = 'approved' then
        new.license_number := old.license_number;
      end if;
    end if;
  end if;

  -- Only approved operators can be Available (FR-O3, FR-O4).
  if new.status <> 'approved' then
    new.is_available := false;
  end if;

  if new.is_available and (tg_op = 'INSERT' or not old.is_available) then
    new.available_since := now();
  elsif not new.is_available then
    new.available_since := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger operators_guard
before insert or update on public.operators
for each row execute function public.operators_guard();

create or replace function public.owns_operator(p_operator_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.operators where id = p_operator_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Trucks
-- ---------------------------------------------------------------------------

create table public.trucks (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete cascade,
  type        public.truck_type not null,
  plate       text check (char_length(plate) <= 20),
  photo_path  text,
  created_at  timestamptz not null default now()
);

create index trucks_operator_idx on public.trucks (operator_id);

-- ---------------------------------------------------------------------------
-- Documents (tow license, insurance, USDOT)
-- Files live in the private `operator-docs` storage bucket; this table holds the record.
-- ---------------------------------------------------------------------------

create table public.operator_documents (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete cascade,
  kind        public.document_kind not null,
  file_path   text,
  expires_on  date,
  verified    boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  notes       text check (char_length(notes) <= 500),
  created_at  timestamptz not null default now()
);

create index operator_documents_operator_idx on public.operator_documents (operator_id, kind);

-- Operators can't verify their own documents, and changing a file or date resets verification.
create or replace function public.documents_guard()
returns trigger
language plpgsql
as $$
begin
  if not public.is_privileged() then
    if tg_op = 'INSERT' then
      new.verified := false;
      new.verified_at := null;
      new.verified_by := null;
    else
      if new.file_path is distinct from old.file_path
         or new.expires_on is distinct from old.expires_on
         or new.kind is distinct from old.kind then
        new.verified := false;
        new.verified_at := null;
        new.verified_by := null;
      else
        new.verified := old.verified;
        new.verified_at := old.verified_at;
        new.verified_by := old.verified_by;
      end if;
    end if;
  elsif new.verified and (tg_op = 'INSERT' or not old.verified) then
    new.verified_at := now();
    new.verified_by := coalesce(new.verified_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger documents_guard
before insert or update on public.operator_documents
for each row execute function public.documents_guard();

-- ---------------------------------------------------------------------------
-- Positions
-- operator_positions = the one current position per operator (upserted by the operator app).
-- location_pings     = short history, kept 30 days (NFR-5).
-- ---------------------------------------------------------------------------

create table public.operator_positions (
  operator_id uuid primary key references public.operators (id) on delete cascade,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real check (accuracy_m >= 0),
  updated_at  timestamptz not null default now()
);

create table public.location_pings (
  id          bigint generated always as identity primary key,
  operator_id uuid not null references public.operators (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  recorded_at timestamptz not null default now()
);

create index location_pings_operator_time_idx on public.location_pings (operator_id, recorded_at desc);
create index location_pings_time_idx on public.location_pings (recorded_at);

-- Server time is the source of truth, and every position update leaves a ping.
create or replace function public.positions_touch()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  insert into public.location_pings (operator_id, lat, lng) values (new.operator_id, new.lat, new.lng);
  return new;
end;
$$;

create trigger positions_touch
before insert or update on public.operator_positions
for each row execute function public.positions_touch();

-- ---------------------------------------------------------------------------
-- Reports from drivers (FR-D7, FR-A2)
-- ---------------------------------------------------------------------------

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  operator_id      uuid not null references public.operators (id) on delete cascade,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 2000),
  reporter_contact text check (char_length(reporter_contact) <= 200),
  status           public.report_status not null default 'open',
  admin_notes      text check (char_length(admin_notes) <= 2000),
  resolved_by      uuid references auth.users (id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_operator_idx on public.reports (operator_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- The public anon key gets no table access at all; drivers use the two RPCs below.
-- ---------------------------------------------------------------------------

alter table public.admins             enable row level security;
alter table public.operators          enable row level security;
alter table public.trucks             enable row level security;
alter table public.operator_documents enable row level security;
alter table public.operator_positions enable row level security;
alter table public.location_pings     enable row level security;
alter table public.reports            enable row level security;

revoke all on all tables in schema public from anon;

create policy "admins see the admin list"
  on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "operators read own row; admins read all"
  on public.operators for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "operators create their own row"
  on public.operators for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

create policy "operators update own row; admins update any"
  on public.operators for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "admins delete operators"
  on public.operators for delete to authenticated
  using (public.is_admin());

create policy "trucks: owner or admin"
  on public.trucks for all to authenticated
  using (public.owns_operator(operator_id) or public.is_admin())
  with check (public.owns_operator(operator_id) or public.is_admin());

create policy "documents: owner or admin"
  on public.operator_documents for all to authenticated
  using (public.owns_operator(operator_id) or public.is_admin())
  with check (public.owns_operator(operator_id) or public.is_admin());

create policy "positions: owner or admin"
  on public.operator_positions for all to authenticated
  using (public.owns_operator(operator_id) or public.is_admin())
  with check (public.owns_operator(operator_id) or public.is_admin());

create policy "pings: owner or admin can read"
  on public.location_pings for select to authenticated
  using (public.owns_operator(operator_id) or public.is_admin());

create policy "reports: admins read"
  on public.reports for select to authenticated
  using (public.is_admin());

create policy "reports: admins update"
  on public.reports for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Driver-facing functions (callable with the public anon key)
-- ---------------------------------------------------------------------------

-- Nearby available operators, with positions rounded to 2 decimals (~0.6 mi) so drivers
-- never receive exact coordinates (NFR-4). Distance is measured from the rounded point.
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
      and (pos.updated_at > now() - interval '10 minutes' or o.is_demo)
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

-- Drivers can report an operator without an account (FR-D7). Light flood protection.
create or replace function public.submit_report(
  p_operator_id uuid,
  p_reason      public.report_reason,
  p_details     text default null,
  p_contact     text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.operators where id = p_operator_id and status <> 'pending') then
    raise exception 'That operator could not be found.';
  end if;

  if (select count(*) from public.reports
      where operator_id = p_operator_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports for this operator in the last hour. Try again later.';
  end if;

  insert into public.reports (operator_id, reason, details, reporter_contact)
  values (p_operator_id, p_reason, left(nullif(trim(p_details), ''), 2000), left(nullif(trim(p_contact), ''), 200))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping (service role / pg_cron only)
-- ---------------------------------------------------------------------------

-- Switch off operators whose phone stopped sending positions (FR-O8).
create or replace function public.expire_stale_availability()
returns integer
language sql security definer set search_path = public
as $$
  with changed as (
    update public.operators o
    set is_available = false
    where o.is_available
      and not o.is_demo
      and not exists (
        select 1 from public.operator_positions p
        where p.operator_id = o.id and p.updated_at > now() - interval '30 minutes'
      )
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- Keep location history for 30 days only (NFR-5).
create or replace function public.purge_old_pings()
returns integer
language sql security definer set search_path = public
as $$
  with gone as (
    delete from public.location_pings where recorded_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke all on function public.nearby_operators(double precision, double precision, double precision, integer) from public;
revoke all on function public.submit_report(uuid, public.report_reason, text, text) from public;
revoke all on function public.expire_stale_availability() from public, anon, authenticated;
revoke all on function public.purge_old_pings() from public, anon, authenticated;

grant execute on function public.nearby_operators(double precision, double precision, double precision, integer) to anon, authenticated;
grant execute on function public.submit_report(uuid, public.report_reason, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for licenses and insurance, one folder per user id
-- e.g. operator-docs/<auth user id>/insurance-2026.pdf
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('operator-docs', 'operator-docs', false)
on conflict (id) do nothing;

create policy "operators upload to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'operator-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "operators read own docs; admins read all"
  on storage.objects for select to authenticated
  using (bucket_id = 'operator-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "operators delete own docs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'operator-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Optional: schedule housekeeping with pg_cron (Database -> Extensions -> enable pg_cron), then run:
--
--   select cron.schedule('expire-stale-availability', '*/10 * * * *', 'select public.expire_stale_availability()');
--   select cron.schedule('purge-old-pings', '15 3 * * *', 'select public.purge_old_pings()');
-- ---------------------------------------------------------------------------
