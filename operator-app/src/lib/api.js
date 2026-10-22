// Every database and storage call the operator app makes lives in this file, so you can see in one
// place exactly what the app reads and writes. The database's security rules (RLS and triggers)
// decide what each call is allowed to do; this file never has to trust itself.
import { supabase } from './supabase';

// Turns a Supabase { data, error } result into "return data or throw a readable error",
// so screens can use a plain try/catch.
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Operator profile ----------

// The operator row for the signed-in user, or null if they haven't created one yet.
export async function getMyOperator(userId) {
  return unwrap(await supabase.from('operators').select('*').eq('user_id', userId).maybeSingle());
}

// Creates or updates the operator row and returns it as saved.
// The database ignores any attempt to set status here: a new row always starts as 'pending'.
export async function saveOperator(fields, existingId) {
  const query = existingId
    ? supabase.from('operators').update(fields).eq('id', existingId)
    : supabase.from('operators').insert(fields);
  return unwrap(await query.select().single());
}

// Switches Available on or off. Returns the value the database actually stored: if the operator
// isn't approved, the database forces it back to false, and this returns false.
export async function setAvailable(operatorId, available) {
  const row = unwrap(
    await supabase.from('operators').update({ is_available: available }).eq('id', operatorId).select('is_available').single(),
  );
  return row.is_available;
}

// ---------- Trucks ----------

export async function listTrucks(operatorId) {
  return unwrap(await supabase.from('trucks').select('*').eq('operator_id', operatorId).order('created_at'));
}

export async function addTruck(operatorId, type, plate) {
  return unwrap(
    await supabase.from('trucks').insert({ operator_id: operatorId, type, plate: plate.trim() || null }).select().single(),
  );
}

export async function removeTruck(truckId) {
  unwrap(await supabase.from('trucks').delete().eq('id', truckId));
}

// ---------- Documents ----------

export async function listDocuments(operatorId) {
  return unwrap(
    await supabase.from('operator_documents').select('*').eq('operator_id', operatorId).order('created_at', { ascending: false }),
  );
}

// Uploads a picked file to private storage, then records it in operator_documents.
// Each upload adds a NEW record instead of replacing the old one. That way an operator renewing
// their insurance stays on the map with the old (still valid) record while an admin checks the new one.
export async function uploadDocument({ operatorId, userId, kind, file, expiresOn }) {
  const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  // The first folder must be the user's own ID: the storage rules only allow uploads there.
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;

  // Read the picked file into memory as raw bytes. This is the method Supabase's Expo guide uses.
  const bytes = await fetch(file.uri).then((res) => res.arrayBuffer());

  unwrap(
    await supabase.storage.from('operator-docs').upload(path, bytes, {
      contentType: file.mimeType || 'application/octet-stream',
      upsert: false,
    }),
  );

  return unwrap(
    await supabase
      .from('operator_documents')
      .insert({ operator_id: operatorId, kind, file_path: path, expires_on: expiresOn })
      .select()
      .single(),
  );
}

// ---------- Position ----------

// Saves the operator's current position. "Upsert" = insert the first time, update after that,
// because operator_positions keeps exactly one row per operator. The database stamps the time
// itself and copies each update into location_pings.
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
  );
}
