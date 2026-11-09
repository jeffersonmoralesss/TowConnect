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
