// Downtown DC, used when the driver's location is unavailable.
export const DC_CENTER = { lat: 38.9007, lng: -77.0365 }

const KM_PER_MILE = 1.609344

export function roundCoord(value) {
  return Math.round(value * 100) / 100
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function formatMiles(km) {
  const mi = km / KM_PER_MILE
  if (mi < 0.5) return 'Under half a mile'
  if (mi < 10) return `About ${mi.toFixed(1)} mi`
  return `About ${Math.round(mi)} mi`
}

// Ask the phone for the driver's position. Resolves to null when denied or unavailable.
export function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}
