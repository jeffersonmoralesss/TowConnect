// Every database and storage call the operator web app makes. It matches operator-app/src/lib/api.js
// call for call, except for file uploads (browsers hand us a File) and the check-in code functions,
// which only iPhone operators need.
import { supabase } from './supabase'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---------- Operator profile ----------

export async function getMyOperator(userId) {
  return unwrap(await supabase.from('operators').select('*').eq('user_id', userId).maybeSingle())
}

export async function saveOperator(fields, existingId) {
  const query = existingId
    ? supabase.from('operators').update(fields).eq('id', existingId)
    : supabase.from('operators').insert(fields)
  return unwrap(await query.select().single())
}

// Returns what the database stored: false if it refused (for example, not approved).
export async function setAvailable(operatorId, available) {
  const row = unwrap(
    await supabase.from('operators').update({ is_available: available }).eq('id', operatorId).select('is_available').single(),
  )
  return row.is_available
}

// ---------- Trucks ----------

export async function listTrucks(operatorId) {
  return unwrap(await supabase.from('trucks').select('*').eq('operator_id', operatorId).order('created_at'))
}

export async function addTruck(operatorId, type, plate) {
  return unwrap(
    await supabase.from('trucks').insert({ operator_id: operatorId, type, plate: plate.trim() || null }).select().single(),
  )
}

export async function removeTruck(truckId) {
  unwrap(await supabase.from('trucks').delete().eq('id', truckId))
}

// ---------- Documents ----------

export async function listDocuments(operatorId) {
  return unwrap(
    await supabase.from('operator_documents').select('*').eq('operator_id', operatorId).order('created_at', { ascending: false }),
  )
}

// `file` is the File the browser gives us from <input type="file">. Supabase can upload it directly.
// Each upload adds a new record, so a renewal in review doesn't hide the old, still-valid one.
export async function uploadDocument({ operatorId, userId, kind, file, expiresOn }) {
  const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
  const path = `${userId}/${kind}-${Date.now()}.${ext}`
  unwrap(
    await supabase.storage.from('operator-docs').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    }),
  )
  return unwrap(
    await supabase
      .from('operator_documents')
      .insert({ operator_id: operatorId, kind, file_path: path, expires_on: expiresOn })
      .select()
      .single(),
  )
}

// ---------- Position ----------

export async function sendPosition(operatorId, { latitude, longitude, accuracy }) {
  unwrap(
    await supabase.from('operator_positions').upsert(
      {
        operator_id: operatorId,
        lat: latitude,
        lng: longitude,
        accuracy_m: accuracy == null ? null : Math.max(0, accuracy),
      },
      { onConflict: 'operator_id' },
    ),
  )
}

// ---------- iPhone auto check-in ----------

// When the code was made and last used, or null if auto check-in isn't set up.
export async function getCheckinStatus(operatorId) {
  return unwrap(
    await supabase
      .from('operator_checkin_codes')
      .select('created_at, last_used_at')
      .eq('operator_id', operatorId)
      .maybeSingle(),
  )
}

// Makes a new code (cancelling any old one) and returns it. It is shown once and never stored.
export async function createCheckinCode() {
  return unwrap(await supabase.rpc('create_checkin_code'))
}

export async function deleteCheckinCode() {
  unwrap(await supabase.rpc('delete_checkin_code'))
}
