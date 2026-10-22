// Runs the migration and seed in an in-memory Postgres with stand-ins for Supabase auth and storage,
// then checks the security rules. Usage: npm install && npm test
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const root = new URL('../..', import.meta.url).pathname
const db = new PGlite()
let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('PASS', msg) } else { fail++; console.log('FAIL', msg) } }

// Supabase stand-ins: roles, auth schema, storage schema
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated;
`)

try { await db.exec(readFileSync(`${root}/supabase/migrations/20261020000000_init.sql`, "utf8")) } catch (e) { console.log("MIGRATION ERROR:", e.message, e.position); process.exit(1) }
// Supabase's default grants (RLS does the real protection)
await db.exec(`
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant usage, select on all sequences in schema public to authenticated, service_role;
  grant select, insert, delete on storage.objects to authenticated;
`)
try { await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8")) } catch (e) { console.log("SEED ERROR:", e.message); process.exit(1) }
ok(true, 'migration and seed run')

const as = async (role, uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const fails = async (fn) => { try { await fn(); return false } catch { return true } }

// --- Anonymous driver ---
const near = await as('anon', null, `select * from public.nearby_operators(38.9, -77.03)`)
ok(near.rows.length === 6, `anon sees 6 demo operators nearby (got ${near.rows.length})`)
ok(near.rows.every(r => Math.abs(r.approx_lat * 100 - Math.round(r.approx_lat * 100)) < 1e-9), 'positions are rounded to 2 decimals')
ok(near.rows[0].distance_km <= near.rows.at(-1).distance_km, 'sorted by distance')
ok(near.rows.every(r => r.truck_types.length === 1), 'truck types attached')
const far = await as('anon', null, `select * from public.nearby_operators(40.71, -74.0, 40)`)
ok(far.rows.length === 0, 'nobody shown 300 km away (New York)')
ok(await fails(() => as('anon', null, `select * from public.operators`)), 'anon cannot read operators table')
ok(await fails(() => as('anon', null, `select * from public.operator_positions`)), 'anon cannot read exact positions')
ok(await fails(() => as('anon', null, `select public.purge_old_pings()`)), 'anon cannot run housekeeping')

const opId = near.rows[0].id
const rep = await as('anon', null, `select public.submit_report($1, 'overcharged', 'Charged double the posted rate', null) as id`, [opId])
ok(!!rep.rows[0].id, 'anon can submit a report')
ok(await fails(() => as('anon', null, `select * from public.reports`)), 'anon cannot read reports')
ok(await fails(() => as('anon', null, `select public.submit_report(gen_random_uuid(), 'other', null, null)`)), 'report for unknown operator is rejected')

// --- An operator signs up ---
const u1 = '11111111-1111-1111-1111-111111111111'
const u2 = '22222222-2222-2222-2222-222222222222'
await db.query(`insert into auth.users values ($1, 'op1@example.com'), ($2, 'op2@example.com')`, [u1, u2])
const ins = await as('authenticated', u1, `insert into public.operators (company_name, phone, license_number, status, is_available)
  values ('New Tow Co', '(202) 555-0100', 'DC-TOW-9', 'approved', true) returning id, status, is_available, user_id`)
const me = ins.rows[0]
ok(me.status === 'pending' && me.is_available === false && me.user_id === u1, 'self sign-up is forced to pending and not available')
await as('authenticated', u1, `update public.operators set status = 'approved' where id = $1`, [me.id])
let row = (await db.query(`select status from public.operators where id = $1`, [me.id])).rows[0]
ok(row.status === 'pending', 'operator cannot approve themselves')
await as('authenticated', u1, `update public.operators set is_available = true where id = $1`, [me.id])
row = (await db.query(`select is_available from public.operators where id = $1`, [me.id])).rows[0]
ok(row.is_available === false, 'pending operator cannot go Available')
const doc = await as('authenticated', u1, `insert into public.operator_documents (operator_id, kind, verified) values ($1, 'tow_license', true) returning verified`, [me.id])
ok(doc.rows[0].verified === false, 'operator cannot self-verify a document')
const others = await as('authenticated', u2, `select * from public.operators`)
ok(others.rows.length === 0, 'another user cannot see this operator')
ok(await fails(() => as('authenticated', u2, `insert into public.operator_positions (operator_id, lat, lng) values ($1, 38.9, -77.0)`, [me.id])), 'another user cannot post this operator\'s position')

// --- Admin approves; operator goes Available ---
await db.query(`insert into public.admins values ($1, 'op2@example.com')`, [u2])
await as('authenticated', u2, `update public.operators set status = 'approved' where id = $1`, [me.id])
await as('authenticated', u2, `update public.operator_documents set verified = true, expires_on = current_date + 30 where operator_id = $1`, [me.id])
await as('authenticated', u2, `insert into public.operator_documents (operator_id, kind, verified, expires_on) values ($1, 'insurance', true, current_date + 30)`, [me.id])
await as('authenticated', u1, `update public.operators set is_available = true where id = $1`, [me.id])
await as('authenticated', u1, `insert into public.operator_positions (operator_id, lat, lng) values ($1, 38.93456, -76.99123)
  on conflict (operator_id) do update set lat = excluded.lat, lng = excluded.lng`, [me.id])
const near2 = await as('anon', null, `select * from public.nearby_operators(38.93, -76.99)`)
const mine = near2.rows.find(r => r.id === me.id)
ok(!!mine, 'approved, verified, available operator appears for drivers')

// After approval the operator app can still edit the phone, but the license number is locked
await as('authenticated', u1, `update public.operators set phone = '(202) 555-0199', license_number = 'FAKE-123' where id = $1`, [me.id])
row = (await db.query(`select phone, license_number from public.operators where id = $1`, [me.id])).rows[0]
ok(row.phone === '(202) 555-0199', 'approved operator can update their phone number')
ok(row.license_number === 'DC-TOW-9', 'approved operator cannot change their license number')
ok(mine && mine.approx_lat === 38.93 && mine.approx_lng === -76.99, `exact position hidden (shown ${mine?.approx_lat}, ${mine?.approx_lng})`)
const pings = await db.query(`select count(*)::int n from public.location_pings where operator_id = $1`, [me.id])
ok(pings.rows[0].n === 1, 'position update leaves one history ping')

// Expired insurance hides them
await db.query(`update public.operator_documents set expires_on = current_date - 1 where operator_id = $1 and kind = 'insurance'`, [me.id])
const near3 = await as('anon', null, `select * from public.nearby_operators(38.93, -76.99)`)
ok(!near3.rows.find(r => r.id === me.id), 'expired insurance hides the operator')
await db.query(`update public.operator_documents set expires_on = current_date + 30 where operator_id = $1 and kind = 'insurance'`, [me.id])

// Re-uploading a document resets verification
await as('authenticated', u1, `update public.operator_documents set file_path = 'x/new.pdf' where operator_id = $1 and kind = 'insurance'`, [me.id])
row = (await db.query(`select verified from public.operator_documents where operator_id = $1 and kind = 'insurance'`, [me.id])).rows[0]
ok(row.verified === false, 'changing a document file resets verification')

// Stale position + housekeeping
await db.query(`update public.operator_documents set verified = true where operator_id = $1`, [me.id])
await db.query(`alter table public.operator_positions disable trigger positions_touch`)
await db.query(`update public.operator_positions set updated_at = now() - interval '45 minutes' where operator_id = $1`, [me.id])
await db.query(`alter table public.operator_positions enable trigger positions_touch`)
const near4 = await as('anon', null, `select * from public.nearby_operators(38.93, -76.99)`)
ok(!near4.rows.find(r => r.id === me.id), 'stale position (45 min) hides the operator')
const expired = (await db.query(`select public.expire_stale_availability() n`)).rows[0].n
row = (await db.query(`select is_available from public.operators where id = $1`, [me.id])).rows[0]
ok(expired === 1 && row.is_available === false, 'housekeeping switches stale operator off (demo rows untouched)')

// Suspension
await as('authenticated', u2, `update public.operators set status = 'suspended' where id = $1`, [me.id])
await as('authenticated', u1, `update public.operators set is_available = true where id = $1`, [me.id])
row = (await db.query(`select is_available from public.operators where id = $1`, [me.id])).rows[0]
ok(row.is_available === false, 'suspended operator cannot go Available')

// Admin sees reports
const reps = await as('authenticated', u2, `select * from public.reports`)
ok(reps.rows.length === 1, 'admin can read reports')
const reps1 = await as('authenticated', u1, `select * from public.reports`)
ok(reps1.rows.length === 0, 'operator cannot read reports')

// Storage folder rules
const okUpload = !(await fails(() => as('authenticated', u1, `insert into storage.objects (bucket_id, name) values ('operator-docs', '${u1}/license.pdf')`)))
ok(okUpload, 'operator can upload into their own folder')
ok(await fails(() => as('authenticated', u1, `insert into storage.objects (bucket_id, name) values ('operator-docs', '${u2}/license.pdf')`)), 'operator cannot upload into someone else\'s folder')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
