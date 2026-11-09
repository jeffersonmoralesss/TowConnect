// Small rules for directory listings, kept out of the screen so they can be tested
// (tests/listing.test.mjs). They mirror the database's own CHECK rules, so mistakes show up next to
// the right field instead of as a raw database error.

export const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/ // same pattern as listed_companies.phone

export const SERVICE_OPTIONS = ['Towing', 'Jump start', 'Lockout', 'Tire change', 'Winch out', 'Fuel delivery', 'Accident recovery', 'Heavy duty']

export function checkListingPhone(value) {
  const v = value.trim()
  if (!v) return null // a listing can be saved without one; it just can't be published
  return PHONE_PATTERN.test(v) ? null : 'Use digits only, for example (202) 555-0142.'
}

// Google Maps gives you "38.9072, -77.0369" when you right-click a spot. Accepts that, with or
// without the space, and returns { lat, lng } or null.
export function parseLatLng(text) {
  const m = String(text ?? '').trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Can this listing go live? Returns the reason it can't, or null.
export function publishProblem(listing) {
  if (!listing.phone?.trim()) return 'Add a phone number first.'
  if (listing.lat == null || listing.lng == null) return 'It needs a location (DC data usually has one; for others, paste it from Google Maps).'
  if (!listing.show_exact_location && !listing.area_label?.trim()) return 'Home-based: add an area, like "Northeast DC", so drivers know where it serves.'
  return null
}

// Search helpers for the person reviewing.
export const phoneSearchUrl = (listing) =>
  `https://www.google.com/search?q=${encodeURIComponent(`"${listing.name}" ${listing.address ?? 'Washington DC'} tow phone`)}`
export const mapUrl = (listing) => `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`
