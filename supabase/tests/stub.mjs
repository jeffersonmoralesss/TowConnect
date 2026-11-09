// A fresh in-memory Postgres with stand-ins for the Supabase pieces our migrations expect
// (roles, auth.users, auth.uid(), storage), and every migration applied in order.
// security.test.mjs builds the same thing inline; this helper is for smaller test files.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'

export async function makeDb() {
  const root = new URL('../migrations/', import.meta.url)
  const db = new PGlite()
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
  `)
  for (const file of readdirSync(root).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, root), 'utf8'))
  }
  return db
}
