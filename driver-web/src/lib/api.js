import { createClient } from '@supabase/supabase-js'
import { DEMO_LISTINGS, DEMO_OPERATORS } from './demoData.js'
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
// The database caps the radius at 25 km (about 15 miles) and returns at most 10 trucks.
export async function fetchNearbyOperators({ lat, lng, radiusKm = 25 }) {
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

// Mirrors nearby_listed_companies(): home-based listings get no pin or address, and their distance
// is measured from a coarse grid point (0.05 degrees, about 3 miles).
function demoListings({ lat, lng, radiusKm }) {
  const coarse = (v) => Math.round(v * 20) / 20
  return DEMO_LISTINGS.map(({ lat: lLat, lng: lLng, show_exact_location: exact, address, ...rest }) => {
    const mLat = exact ? lLat : coarse(lLat)
    const mLng = exact ? lLng : coarse(lLng)
    return {
      ...rest,
      address: exact ? address : null,
      pin_lat: exact ? lLat : null,
      pin_lng: exact ? lLng : null,
      distance_km: Math.round(distanceKm(lat, lng, mLat, mLng) * 10) / 10,
      is_demo: true,
    }
  })
    .filter((c) => c.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
}

/** Licensed tow companies that are not on Tow Connect, reviewed by a person before they appear. */
export async function fetchNearbyListings({ lat, lng, radiusKm = 25 }) {
  if (isDemo) {
    await wait(250)
    return demoListings({ lat, lng, radiusKm })
  }
  const { data, error } = await supabase.rpc('nearby_listed_companies', {
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
