-- Tow Connect: company directory + safety hardening
-- Run AFTER the first two migrations, once, in the Supabase SQL Editor.
--
-- What this adds:
--   1. listed_companies: licensed tow companies that are NOT on Tow Connect yet, so drivers have
--      someone to call while few operators use the app. Every listing is reviewed by a person
--      before drivers can see it.
--   2. nearby_listed_companies(): the public lookup for those listings.
--   3. Tighter limits on nearby_operators(): a smaller maximum search radius and at most 10
--      results, so one request can't collect every available operator in the region.
--   4. Schedules the two cleanup jobs with pg_cron, when pg_cron is available.

-- ---------------------------------------------------------------------------
-- 1. The company directory
-- ---------------------------------------------------------------------------

-- Where a listing is in the review process:
--   new       - imported or added, not yet checked. Drivers never see it.
--   published - checked by a person (does roadside towing, phone number confirmed). Drivers see it.
--   hidden    - checked and rejected, for example a company that only does private-lot towing.
--   removed   - the company asked to be removed. Kept (hidden) so a re-import doesn't add it back.
create type public.listing_status as enum ('new', 'published', 'hidden', 'removed');

create table public.listed_companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 2 and 160),
  phone                text check (phone ~ '^\+?[0-9 ().-]{7,20}$'),
  address              text check (char_length(address) <= 300),
  -- Shown instead of the address when show_exact_location is false, e.g. 'Northeast DC'.
  area_label           text check (char_length(area_label) <= 80),
  lat                  double precision check (lat between -90 and 90),
  lng                  double precision check (lng between -180 and 180),
  -- Turn off for businesses registered at a home: drivers then see only a general area, never a pin.
  show_exact_location  boolean not null default true,
  jurisdiction         text not null default 'DC' check (jurisdiction in ('DC', 'MD', 'VA')),
  services             text[] not null default '{}',
  source               text not null check (source in ('dc_license', 'manual')),
  -- DC's customer number for the business, so re-running the import updates the same row.
  dc_customer_number   text unique,
  license_status       text,
  license_end_date     date,
  last_checked_on      date not null default current_date,
  review_status        public.listing_status not null default 'new',
  reviewer_notes       text check (char_length(reviewer_notes) <= 1000),
  -- Set when this company joins Tow Connect; the listing then hides so it doesn't appear twice.
  operator_id          uuid references public.operators (id) on delete set null,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index listed_companies_review_idx on public.listed_companies (review_status);

create or replace function public.listed_companies_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- A listing can't go live without a phone number to call and a location to measure distance from.
  if new.review_status = 'published' and (new.phone is null or new.lat is null or new.lng is null) then
    raise exception 'A published listing needs a phone number and a location.';
  end if;
  return new;
end;
$$;

create trigger listed_companies_touch
before insert or update on public.listed_companies
for each row execute function public.listed_companies_touch();

-- Only admins can read or change the directory directly. The public uses the function below.
alter table public.listed_companies enable row level security;
revoke all on public.listed_companies from anon;

create policy "listed companies: admins only"
  on public.listed_companies for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. nearby_listed_companies(): the public lookup
-- ---------------------------------------------------------------------------

-- Published listings near a point, closest first. Rules:
--   - only 'published', with a phone number, and not already on Tow Connect
--   - DC-license listings drop out automatically once the license end date passes
--   - when show_exact_location is off, no pin is returned, and distance is measured from a
--     coarse ~3-mile grid point, so the response never narrows down a home address
create or replace function public.nearby_listed_companies(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 25,
  p_limit     integer default 10
)
returns table (
  id               uuid,
  name             text,
  phone            text,
  address          text,
  area_label       text,
  pin_lat          double precision,
  pin_lng          double precision,
  distance_km      double precision,
  jurisdiction     text,
  services         text[],
  source           text,
  license_end_date date,
  last_checked_on  date,
  is_demo          boolean
)
language sql stable security definer set search_path = public
as $$
  with params as (
    select
      greatest(-90.0, least(90.0, p_lat))   as lat,
      greatest(-180.0, least(180.0, p_lng)) as lng,
      greatest(1.0, least(25.0, coalesce(p_radius_km, 25))) as radius,
      greatest(1, least(10, coalesce(p_limit, 10))) as lim
  ),
  visible as (
    select
      c.*,
      case when c.show_exact_location then c.lat else round(c.lat::numeric * 20) / 20 end::double precision as mlat,
      case when c.show_exact_location then c.lng else round(c.lng::numeric * 20) / 20 end::double precision as mlng
    from public.listed_companies c
    where c.review_status = 'published'
      and c.phone is not null
      and c.lat is not null and c.lng is not null
      and c.operator_id is null
      and (c.source <> 'dc_license' or c.license_end_date is null or c.license_end_date >= current_date)
  )
  select
    v.id, v.name, v.phone,
    case when v.show_exact_location then v.address end,
    v.area_label,
    case when v.show_exact_location then v.lat end,
    case when v.show_exact_location then v.lng end,
    round(d.km::numeric, 1)::double precision,
    v.jurisdiction, v.services, v.source, v.license_end_date, v.last_checked_on, v.is_demo
  from visible v
  cross join params p
  cross join lateral (
    select 2 * 6371 * asin(least(1.0, sqrt(
      power(sin(radians(v.mlat - p.lat) / 2), 2)
      + cos(radians(p.lat)) * cos(radians(v.mlat)) * power(sin(radians(v.mlng - p.lng) / 2), 2)
    ))) as km
  ) d
  where d.km <= p.radius
  order by d.km
  limit (select lim from params);
$$;

-- ---------------------------------------------------------------------------
-- 3. nearby_operators(): smaller radius (25 km, about 15 miles; was 100 km) and at most 10 results
--    (was 50). Same function as before otherwise.
-- ---------------------------------------------------------------------------

create or replace function public.nearby_operators(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 25,
  p_limit     integer default 10
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
      greatest(1.0, least(25.0, coalesce(p_radius_km, 25))) as radius,
      greatest(1, least(10, coalesce(p_limit, 10))) as lim
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
-- 4. Schedule the cleanup jobs (only where pg_cron exists, which Supabase has)
--    - every 10 minutes: switch off operators with no position for 3 hours
--    - every night at 3:15 (UTC): delete location history older than 30 days
-- Scheduling a job with a name that already exists replaces it, so running this twice is safe.
-- The test database has no pg_cron, so there this block quietly does nothing.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute $job$select cron.schedule('expire-stale-availability', '*/10 * * * *', 'select public.expire_stale_availability()')$job$;
    execute $job$select cron.schedule('purge-old-pings', '15 3 * * *', 'select public.purge_old_pings()')$job$;
    raise notice 'Scheduled the two cleanup jobs with pg_cron.';
  else
    raise notice 'pg_cron is not available here, so the cleanup jobs were not scheduled.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.nearby_listed_companies(double precision, double precision, double precision, integer) from public;
grant execute on function public.nearby_listed_companies(double precision, double precision, double precision, integer) to anon, authenticated;
