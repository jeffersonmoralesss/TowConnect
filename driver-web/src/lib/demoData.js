// Same six made-up operators as supabase/seed.sql. Phone numbers use the fictional 555-01xx range.
export const DEMO_OPERATORS = [
  {
    id: 'demo-1', company_name: 'Capitol Hook & Haul', phone: '(202) 555-0142',
    license_number: 'DEMO-DC-1001', usdot_number: '0000001', jurisdiction: 'DC',
    services: ['Towing', 'Jump start', 'Lockout'], truck_types: ['flatbed'],
    hookup_fee: 95, per_mile_rate: 4.5, rate_notes: 'Night rate after 10 pm: +$25',
    lat: 38.8764, lng: -77.0035,
  },
  {
    id: 'demo-2', company_name: 'Brookland Recovery', phone: '(202) 555-0167',
    license_number: 'DEMO-DC-1002', usdot_number: '0000002', jurisdiction: 'DC',
    services: ['Towing', 'Winch out', 'Tire change'], truck_types: ['wheel_lift'],
    hookup_fee: 85, per_mile_rate: 4, rate_notes: null,
    lat: 38.9333, lng: -76.9945,
  },
  {
    id: 'demo-3', company_name: 'Rock Creek Towing', phone: '(202) 555-0119',
    license_number: 'DEMO-DC-1003', usdot_number: '0000003', jurisdiction: 'DC',
    services: ['Towing', 'Accident recovery'], truck_types: ['flatbed'],
    hookup_fee: 110, per_mile_rate: 5, rate_notes: 'Flatbed only, no motorcycles',
    lat: 38.9215, lng: -77.0425,
  },
  {
    id: 'demo-4', company_name: 'Anacostia Auto Tow', phone: '(202) 555-0188',
    license_number: 'DEMO-DC-1004', usdot_number: '0000004', jurisdiction: 'DC',
    services: ['Towing', 'Jump start', 'Fuel delivery'], truck_types: ['wheel_lift'],
    hookup_fee: 80, per_mile_rate: 3.75, rate_notes: null,
    lat: 38.8623, lng: -76.9951,
  },
  {
    id: 'demo-5', company_name: 'Georgetown Flatbed', phone: '(202) 555-0133',
    license_number: 'DEMO-DC-1005', usdot_number: '0000005', jurisdiction: 'DC',
    services: ['Towing', 'Accident recovery', 'Lockout'], truck_types: ['flatbed'],
    hookup_fee: 120, per_mile_rate: 5.25, rate_notes: null,
    lat: 38.9076, lng: -77.0723,
  },
  {
    id: 'demo-6', company_name: 'Petworth Heavy Duty', phone: '(202) 555-0156',
    license_number: 'DEMO-DC-1006', usdot_number: '0000006', jurisdiction: 'DC',
    services: ['Towing', 'Heavy duty', 'Winch out'], truck_types: ['heavy_duty'],
    hookup_fee: 150, per_mile_rate: 6, rate_notes: 'Box trucks and vans up to 26,000 lb',
    lat: 38.9404, lng: -77.0247,
  },
]

// Same three made-up directory listings as supabase/seed.sql: companies "not on Tow Connect".
// Takoma is marked as home-based, so (like the database) it gets no pin and no address.
export const DEMO_LISTINGS = [
  {
    id: 'listing-1', name: 'Eastern Avenue Towing (sample)', phone: '(202) 555-0171',
    address: '1200 Sample St NE, Washington, DC', area_label: null, lat: 38.9196, lng: -76.9842,
    show_exact_location: true, jurisdiction: 'DC', services: ['Towing', 'Jump start'], source: 'manual',
    license_end_date: null, last_checked_on: '2026-11-09',
  },
  {
    id: 'listing-2', name: 'Navy Yard Wrecker Service (sample)', phone: '(202) 555-0174',
    address: '50 Example Ave SE, Washington, DC', area_label: null, lat: 38.876, lng: -77.002,
    show_exact_location: true, jurisdiction: 'DC', services: ['Towing', 'Accident recovery'], source: 'manual',
    license_end_date: null, last_checked_on: '2026-11-09',
  },
  {
    id: 'listing-3', name: 'Takoma Family Towing (sample)', phone: '(202) 555-0177',
    address: null, area_label: 'Takoma, DC', lat: 38.971, lng: -77.018,
    show_exact_location: false, jurisdiction: 'DC', services: ['Towing', 'Lockout'], source: 'manual',
    license_end_date: null, last_checked_on: '2026-11-09',
  },
]
