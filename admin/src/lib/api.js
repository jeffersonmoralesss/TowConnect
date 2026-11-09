// Everything the admin panel reads and writes. Screens never call supabase directly, so this one
// file shows every way the panel touches the database.
//
// None of this is protected by the panel itself: anyone could call these with the public key.
// The protection is in the database (row level security + is_admin(), which needs the authenticator
// step). This file is just the convenient way in for someone who already passed those checks.
import { supabase } from './supabase'

// supabase-js returns { data, error } instead of throwing. This turns errors into exceptions so
// screens can use one try/catch.
function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---------- Who am I ----------

export async function whoami() {
  return unwrap(await supabase.rpc('admin_whoami'))
}

export async function signOut() {
  await supabase.auth.signOut()
}

// ---------- Two-step sign-in (authenticator app, "TOTP") ----------

// 'aal1' = password only, 'aal2' = password + authenticator code.
// nextLevel is 'aal2' when the account already has an authenticator set up.
export async function getAssurance() {
  return unwrap(await supabase.auth.mfa.getAuthenticatorAssuranceLevel())
}

export async function verifiedFactor() {
  const data = unwrap(await supabase.auth.mfa.listFactors())
  return data.totp.find((f) => f.status === 'verified') ?? null
}

// Starts setting up an authenticator. Returns { factorId, qrCode, secret }.
// An earlier attempt that was never finished leaves an 'unverified' factor behind; we remove those
// first, or Supabase refuses a second one with the same name.
export async function startEnroll() {
  const data = unwrap(await supabase.auth.mfa.listFactors())
  for (const f of data.all.filter((x) => x.status === 'unverified')) {
    await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const enrolled = unwrap(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Tow Connect admin' }))
  return { factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret }
}

// Checks a 6-digit code. On success Supabase upgrades the session to aal2.
export async function verifyCode(factorId, code) {
  unwrap(await supabase.auth.mfa.challengeAndVerify({ factorId, code }))
}

// ---------- Counts for the tabs ----------

async function count(table, column, value) {
  const { count: n, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, value)
  if (error) throw new Error(error.message)
  return n ?? 0
}

export async function getCounts() {
  const [pending, reports, listings] = await Promise.all([
    count('operators', 'status', 'pending'),
    count('reports', 'status', 'open'),
    count('listed_companies', 'review_status', 'new'),
  ])
  return { pending, reports, listings }
}

// ---------- Operators ----------

// One query brings each operator with their trucks and documents (Supabase follows the foreign keys).
export async function listOperators(status) {
  return unwrap(
    await supabase
      .from('operators')
      .select('*, trucks(*), operator_documents(*)')
      .eq('status', status)
      .eq('is_demo', false)
      .order('created_at', { ascending: status === 'pending' }), // oldest application first
  )
}

// Just enough of every operator to spot duplicates.
export async function listOperatorKeys() {
  return unwrap(await supabase.from('operators').select('id, company_name, phone, license_number'))
}

// Documents are in a private bucket. A signed link works for 5 minutes, then expires, so a link
// that ends up in browser history or a screenshot doesn't keep working.
export async function documentLink(path) {
  const data = unwrap(await supabase.storage.from('operator-docs').createSignedUrl(path, 300))
  return data.signedUrl
}

// Returns { ok, message }. The database refuses if a document is missing or expired.
export async function approveOperator(operatorId, listingId = null) {
  return unwrap(await supabase.rpc('approve_operator', { p_operator_id: operatorId, p_listing_id: listingId }))
}

// 'suspended' takes them off the map at once (a database trigger switches Available off);
// 'pending' sends them back to the review queue.
export async function setOperatorStatus(operatorId, status) {
  unwrap(await supabase.from('operators').update({ status }).eq('id', operatorId))
}

export async function setDocumentVerified(documentId, verified) {
  unwrap(await supabase.from('operator_documents').update({ verified }).eq('id', documentId))
}

// ---------- Directory ----------

// Light version for matching operators to listings.
export async function listListingNames() {
  return unwrap(await supabase.from('listed_companies').select('id, name, source, license_end_date, operator_id'))
}

export async function listListings(status) {
  return unwrap(
    await supabase
      .from('listed_companies')
      .select('*')
      .eq('review_status', status)
      .order('name'),
  )
}

export async function updateListing(id, changes) {
  return unwrap(await supabase.from('listed_companies').update(changes).eq('id', id).select().single())
}

// Several at once (the "publish selected" button). Each row still goes through the database check
// that a published listing has a phone number and a location; if any fails, none are changed.
export async function setListingsStatus(ids, review_status) {
  unwrap(await supabase.from('listed_companies').update({ review_status }).in('id', ids))
}

export async function addListing(row) {
  return unwrap(await supabase.from('listed_companies').insert(row).select().single())
}

// ---------- Reports ----------

export async function listReports(status) {
  return unwrap(
    await supabase
      .from('reports')
      .select('*, operators(id, company_name, phone, status)')
      .eq('status', status)
      .order('created_at', { ascending: false }),
  )
}

export async function saveReportNotes(id, admin_notes) {
  unwrap(await supabase.from('reports').update({ admin_notes }).eq('id', id))
}

export async function setReportStatus(id, status) {
  const { data } = await supabase.auth.getUser()
  const resolved = status === 'resolved'
  unwrap(
    await supabase
      .from('reports')
      .update({
        status,
        resolved_by: resolved ? data.user.id : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq('id', id),
  )
}

// ---------- Admins and the activity log ----------

export async function listAdmins() {
  return unwrap(await supabase.from('admins').select('*').order('created_at'))
}

export async function addAdmin(email) {
  return unwrap(await supabase.rpc('add_admin', { p_email: email }))
}

export async function removeAdmin(userId) {
  return unwrap(await supabase.rpc('remove_admin', { p_user_id: userId }))
}

export async function listActivity(limit = 100) {
  return unwrap(await supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(limit))
}

export async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}
