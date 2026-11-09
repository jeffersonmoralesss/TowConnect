-- Tow Connect: support for the admin panel (admin/)
-- Run once in the Supabase SQL Editor, after the three earlier migrations.
--
-- What this adds:
--   1. Admin powers need two-step sign-in. is_admin() is now true only when the admin signed in
--      with a password AND a code from an authenticator app (Supabase calls this "aal2").
--   2. admin_whoami(): tells the admin panel whether this account is an admin, and whether the
--      second step is done, so it can show the right screen.
--   3. approve_operator(): approves an operator and verifies their documents in one step, and can
--      link them to their directory listing so they don't appear twice.
--   4. add_admin() / remove_admin(): manage admins from the panel instead of SQL.
--   5. admin_log: a record of who approved, suspended, verified, published or resolved what.
--      Filled by triggers, so it also records changes made in the SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Admin powers require two-step sign-in
-- ---------------------------------------------------------------------------

-- auth.jwt() is the signed token Supabase attaches to each request. Its 'aal' claim is 'aal1' after a
-- password alone and 'aal2' after the authenticator code too. A stolen password alone is no longer
-- enough to read operators' documents or approve anyone. The SQL Editor is unaffected: it runs as
-- the project owner, which is_privileged() already allows without going through is_admin().
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_whoami()
-- ---------------------------------------------------------------------------

-- The panel calls this right after the password step. It reveals nothing to non-admins beyond
-- "you're not an admin", which they already know.
create or replace function public.admin_whoami()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'is_admin_account', exists (select 1 from public.admins where user_id = auth.uid()),
    'mfa_done',         coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5 (first, because the functions below write to it). The activity log
-- ---------------------------------------------------------------------------

create table public.admin_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users (id) on delete set null, -- null = SQL Editor
  admin_email text,
  action      text not null,         -- e.g. 'approved', 'suspended', 'verified', 'published'
  target_type text not null,         -- 'operator' | 'document' | 'report' | 'listing' | 'admin'
  target_id   text,
  target_name text,
  created_at  timestamptz not null default now()
);

create index admin_log_time_idx on public.admin_log (created_at desc);

-- Admins can read the log. Nobody can write to it directly or edit it: only the triggers below,
-- which run as the table owner, add rows. That makes it trustworthy as a record.
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon;

create policy "admin log: admins read"
  on public.admin_log for select to authenticated
  using (public.is_admin());

create or replace function public.log_admin_action(
  p_action text, p_target_type text, p_target_id text, p_target_name text
)
returns void
language sql security definer set search_path = public
as $$
  insert into public.admin_log (admin_id, admin_email, action, target_type, target_id, target_name)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_target_name);
$$;

-- Operator approved / suspended / set back to pending.
create or replace function public.log_operator_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.log_admin_action(new.status::text, 'operator', new.id::text, new.company_name);
  end if;
  return null;
end;
$$;

create trigger log_operator_status
after update on public.operators
for each row execute function public.log_operator_status();

-- A document verified, or un-verified by an admin. (An operator re-uploading a file also clears
-- 'verified', but that isn't an admin action, so it isn't logged.)
create or replace function public.log_document_verified()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- (auth.uid() is null in the SQL Editor. is_privileged() can't be used here: inside a SECURITY
  -- DEFINER function it always sees the owner, so it would be true for everyone.)
  if new.verified is distinct from old.verified and (new.verified or public.is_admin() or auth.uid() is null) then
    perform public.log_admin_action(
      case when new.verified then 'verified' else 'unverified' end,
      'document',
      new.id::text,
      (select company_name from public.operators where id = new.operator_id) || ': ' || new.kind::text
    );
  end if;
  return null;
end;
$$;

create trigger log_document_verified
after update on public.operator_documents
for each row execute function public.log_document_verified();

-- Report resolved or reopened.
create or replace function public.log_report_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.log_admin_action(new.status::text, 'report', new.id::text,
      (select company_name from public.operators where id = new.operator_id) || ': ' || new.reason::text);
  end if;
  return null;
end;
$$;

create trigger log_report_status
after update on public.reports
for each row execute function public.log_report_status();

-- Directory listing published, hidden or removed.
create or replace function public.log_listing_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.review_status is distinct from old.review_status then
    perform public.log_admin_action(new.review_status::text, 'listing', new.id::text, new.name);
  end if;
  return null;
end;
$$;

create trigger log_listing_status
after update on public.listed_companies
for each row execute function public.log_listing_status();

-- Admin added or removed.
create or replace function public.log_admin_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_action('added', 'admin', new.user_id::text, new.email);
  else
    perform public.log_admin_action('removed', 'admin', old.user_id::text, old.email);
  end if;
  return null;
end;
$$;

create trigger log_admin_change
after insert or delete on public.admins
for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------------
-- 3. approve_operator()
-- ---------------------------------------------------------------------------

-- One step instead of two SQL updates, so an operator can never end up "approved" with unverified
-- documents (or the reverse) if something fails halfway: a function runs as one transaction.
-- SECURITY INVOKER (the default): it runs with the caller's own rights, so the normal row rules
-- still apply, and the is_admin() check below is a second lock on the same door.
create or replace function public.approve_operator(p_operator_id uuid, p_listing_id uuid default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_name    text;
  v_missing text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve operators.' using errcode = '42501';
  end if;

  select company_name into v_name from public.operators where id = p_operator_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', 'That operator no longer exists.');
  end if;

  -- Both required documents must be uploaded (a file, not just a typed date) and unexpired.
  select string_agg(label, ' and ') into v_missing
  from (values ('tow_license'::public.document_kind, 'tow license'), ('insurance', 'insurance')) as req(kind, label)
  where not exists (
    select 1 from public.operator_documents d
    where d.operator_id = p_operator_id and d.kind = req.kind
      and d.file_path is not null and d.expires_on >= current_date
  );
  if v_missing is not null then
    return jsonb_build_object('ok', false, 'message', 'Can''t approve yet: the ' || v_missing || ' is missing or expired.');
  end if;

  update public.operator_documents
  set verified = true
  where operator_id = p_operator_id
    and not verified
    and (expires_on is null or expires_on >= current_date);

  update public.operators set status = 'approved' where id = p_operator_id;

  -- They're on Tow Connect now, so their directory listing (if any) steps aside.
  if p_listing_id is not null then
    update public.listed_companies set operator_id = p_operator_id where id = p_listing_id;
  end if;

  return jsonb_build_object('ok', true, 'message', v_name || ' is approved. They can go Available now.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. add_admin() / remove_admin()
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because looking up an email in auth.users needs more rights than an app user has.
-- The is_admin() check makes sure only an admin (with two-step sign-in) can use that.
create or replace function public.add_admin(p_email text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add admins.' using errcode = '42501';
  end if;
  select id, email into v_id, v_email from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return jsonb_build_object('ok', false, 'message',
      'No account uses that email yet. Ask them to sign up first (in the operator app is fine), then add them.');
  end if;
  if exists (select 1 from public.admins where user_id = v_id) then
    return jsonb_build_object('ok', false, 'message', v_email || ' is already an admin.');
  end if;
  insert into public.admins (user_id, email) values (v_id, v_email);
  return jsonb_build_object('ok', true, 'message',
    v_email || ' is now an admin. They sign in to the admin panel and set up their authenticator app.');
end;
$$;

-- You can't remove yourself, which also means the last admin can never be removed by accident.
create or replace function public.remove_admin(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove admins.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'You can''t remove yourself. Another admin has to do it.');
  end if;
  delete from public.admins where user_id = p_user_id returning email into v_email;
  if v_email is null then
    return jsonb_build_object('ok', false, 'message', 'That person is not an admin.');
  end if;
  return jsonb_build_object('ok', true, 'message', v_email || ' is no longer an admin.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.admin_whoami() from public, anon;
revoke all on function public.approve_operator(uuid, uuid) from public, anon;
revoke all on function public.add_admin(text) from public, anon;
revoke all on function public.remove_admin(uuid) from public, anon;
revoke all on function public.log_admin_action(text, text, text, text) from public, anon, authenticated;

grant execute on function public.admin_whoami() to authenticated;
grant execute on function public.approve_operator(uuid, uuid) to authenticated;
grant execute on function public.add_admin(text) to authenticated;
grant execute on function public.remove_admin(uuid) to authenticated;
