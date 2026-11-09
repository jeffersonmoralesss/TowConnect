import { createClient } from '@supabase/supabase-js'
import { DEMO_OPERATORS } from './demoData.js'
import { distanceKm, roundCoord } from './geo.js'

// Every network call in the driver app goes through this file. Components never talk to Supabase
// directly, so switching between demo data and the real backend happens in exactly one place.

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// No keys in .env means demo mode: the same function shapes, but answered from local sample data.
export const isDemo = !url || !anonKey

const supabase = isDemo
  ? null
  : createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Mirrors the database function: rounded positions only, sorted by distance from the driver.
function demoNearby({ lat, lng, radiusKm }) {
  return DEMO_OPERATORS.map(({ lat: opLat, lng: opLng, ...op }) => {
    const approx_lat = roundCoord(opLat)
    const approx_lng = roundCoord(opLng)
    return {
      ...op,
      approx_lat,
      approx_lng,
      distance_km: distanceKm(lat, lng, approx_lat, approx_lng),
      position_age_s: op.id === 'demo-2' ? 14 * 60 : 30, // demo-2 acts like an iPhone check-in from 14 min ago
      is_demo: true,
    }
  })
    .filter((op) => op.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
}

/** Available, verified operators near a point. Positions are rounded (about half a mile). */
export async function fetchNearbyOperators({ lat, lng, radiusKm = 40 }) {
  if (isDemo) {
    await wait(350)
    return demoNearby({ lat, lng, radiusKm })
  }
  const { data, error } = await supabase.rpc('nearby_operators', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Send a report about an operator. No account needed. */
export async function submitReport({ operatorId, reason, details, contact }) {
  if (isDemo) {
    await wait(500)
    return { id: 'demo-report' }
  }
  const { data, error } = await supabase.rpc('submit_report', {
    p_operator_id: operatorId,
    p_reason: reason,
    p_details: details || null,
    p_contact: contact || null,
  })
  if (error) throw new Error(error.message)
  return { id: data }
}
