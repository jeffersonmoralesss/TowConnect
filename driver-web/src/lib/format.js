const TRUCK_LABELS = {
  flatbed: 'Flatbed',
  wheel_lift: 'Wheel-lift',
  heavy_duty: 'Heavy duty',
}

export function truckLabel(types = []) {
  if (!types.length) return 'Tow truck'
  return types.map((t) => TRUCK_LABELS[t] ?? t).join(', ')
}

export function money(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

export function rateSummary(op) {
  const hookup = money(op.hookup_fee)
  const perMile = money(op.per_mile_rate)
  if (hookup && perMile) return `${hookup} hookup + ${perMile}/mi`
  if (hookup) return `${hookup} hookup`
  if (perMile) return `${perMile}/mi`
  return 'Ask for rates'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// '2027-06-30' -> 'Jun 2027', built from the text so the time zone can't shift it to the day before.
const monthYear = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

// What we can honestly say about a directory listing's license.
export function licenseLine(listing) {
  if (listing.source === 'dc_license' && listing.license_end_date) {
    return `DC license active through ${monthYear(listing.license_end_date)}`
  }
  if (listing.source === 'dc_license') return 'DC license on record'
  return `Added by Tow Connect, checked ${monthYear(listing.last_checked_on)}`
}

export function telHref(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

// Short age for the list, shown only when a position is more than 5 minutes old (iPhone operators
// check in at moments, so their pin can be up to 30 minutes old). Fresh pins show nothing extra.
export function staleLabel(seconds) {
  if (seconds == null || seconds < 5 * 60) return null
  return `Location from ${Math.round(seconds / 60)} min ago`
}

export function freshness(seconds) {
  if (seconds == null) return null
  if (seconds < 90) return 'Location updated just now'
  return `Location updated ${Math.round(seconds / 60)} min ago`
}
