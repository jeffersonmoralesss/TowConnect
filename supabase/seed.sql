-- Tow Connect: demo data for testing. NOT for production.
-- Six made-up operators around DC with fictional 555 phone numbers.
-- Remove before launch:  delete from public.operators where is_demo;

with demo (company_name, contact_name, phone, license_number, usdot_number, services, hookup_fee, per_mile_rate, rate_notes, lat, lng, truck) as (
  values
    ('Capitol Hook & Haul',  'Demo operator', '(202) 555-0142', 'DEMO-DC-1001', '0000001', array['Towing','Jump start','Lockout'],          95.00, 4.50, 'Night rate after 10 pm: +$25',  38.8764, -77.0035, 'flatbed'::public.truck_type),
    ('Brookland Recovery',   'Demo operator', '(202) 555-0167', 'DEMO-DC-1002', '0000002', array['Towing','Winch out','Tire change'],      85.00, 4.00, null,                            38.9333, -76.9945, 'wheel_lift'::public.truck_type),
    ('Rock Creek Towing',    'Demo operator', '(202) 555-0119', 'DEMO-DC-1003', '0000003', array['Towing','Accident recovery'],            110.00, 5.00, 'Flatbed only, no motorcycles', 38.9215, -77.0425, 'flatbed'::public.truck_type),
    ('Anacostia Auto Tow',   'Demo operator', '(202) 555-0188', 'DEMO-DC-1004', '0000004', array['Towing','Jump start','Fuel delivery'],    80.00, 3.75, null,                            38.8623, -76.9951, 'wheel_lift'::public.truck_type),
    ('Georgetown Flatbed',   'Demo operator', '(202) 555-0133', 'DEMO-DC-1005', '0000005', array['Towing','Accident recovery','Lockout'],  120.00, 5.25, null,                            38.9076, -77.0723, 'flatbed'::public.truck_type),
    ('Petworth Heavy Duty',  'Demo operator', '(202) 555-0156', 'DEMO-DC-1006', '0000006', array['Towing','Heavy duty','Winch out'],       150.00, 6.00, 'Box trucks and vans up to 26,000 lb', 38.9404, -77.0247, 'heavy_duty'::public.truck_type)
),
ops as (
  insert into public.operators
    (company_name, contact_name, phone, license_number, usdot_number, jurisdiction, status, is_available,
     services, hookup_fee, per_mile_rate, rate_notes, is_demo)
  select company_name, contact_name, phone, license_number, usdot_number, 'DC', 'approved', true,
         services, hookup_fee, per_mile_rate, rate_notes, true
  from demo
  returning id, company_name
),
docs as (
  insert into public.operator_documents (operator_id, kind, expires_on, verified, notes)
  select ops.id, k.kind, (current_date + interval '1 year')::date, true, 'Demo document'
  from ops cross join (values ('tow_license'::public.document_kind), ('insurance'::public.document_kind)) as k(kind)
  returning 1
),
trucks as (
  insert into public.trucks (operator_id, type, plate)
  select ops.id, demo.truck, 'DEMO'
  from ops join demo using (company_name)
  returning 1
)
insert into public.operator_positions (operator_id, lat, lng, accuracy_m)
select ops.id, demo.lat, demo.lng, 15
from ops join demo using (company_name);

-- Three made-up directory listings (companies "not on Tow Connect"), also demo-only.
-- One is marked as home-based, so it shows an area instead of a pin.
-- Remove before launch:  delete from public.listed_companies where is_demo;
insert into public.listed_companies
  (name, phone, address, area_label, lat, lng, show_exact_location, services, source, license_status, license_end_date, review_status, is_demo)
values
  ('Eastern Avenue Towing (sample)', '(202) 555-0171', '1200 Sample St NE, Washington, DC', null, 38.9196, -76.9842, true,  array['Towing','Jump start'], 'manual', null, null, 'published', true),
  ('Navy Yard Wrecker Service (sample)', '(202) 555-0174', '50 Example Ave SE, Washington, DC', null, 38.8760, -77.0020, true,  array['Towing','Accident recovery'], 'manual', null, null, 'published', true),
  ('Takoma Family Towing (sample)', '(202) 555-0177', null, 'Takoma, DC', 38.9710, -77.0180, false, array['Towing','Lockout'], 'manual', null, null, 'published', true);
