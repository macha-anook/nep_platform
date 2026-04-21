-- ============================================================
-- NEP Platform — Robust handle_new_user + sign-in user guard
-- Migration: 009_fix_trigger_and_user_guard
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Fixes:
--   1. handle_new_user trigger: slug collision → uses full UUID suffix;
--      org insert uses ON CONFLICT; role validated; exception caught so
--      auth is never blocked even if profile creation fails.
--   2. check_user_exists() — security-definer RPC callable by anon so
--      the frontend can block sign-in for unregistered emails.
--   3. Backfills public.users rows for any auth.users that have no profile
--      (e.g. previous trigger failures).
-- ============================================================

-- ── 1. Replace handle_new_user with robust version ───────────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  _name      text;
  _slug      text;
  _role      text;
begin
  _name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Use the full UUID (no dashes) as slug suffix — guarantees uniqueness
  _slug := lower(regexp_replace(_name, '[^a-z0-9]+', '-', 'g'))
           || '-' || replace(new.id::text, '-', '');

  -- Role from signup metadata; only doctor / researcher allowed
  _role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'researcher');
  if _role not in ('researcher', 'doctor') then
    _role := 'researcher';
  end if;

  -- Create org (ON CONFLICT handles edge-case re-runs)
  insert into organisations (name, slug)
  values (_name || '''s workspace', _slug)
  on conflict (slug) do update set name = excluded.name
  returning id into new_org_id;

  -- Create profile (idempotent)
  insert into users (id, org_id, email, full_name, role)
  values (new.id, new_org_id, new.email, _name, _role)
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Never block auth — log and move on
  raise warning '[handle_new_user] failed for %: %', new.email, sqlerrm;
  return new;
end;
$$;

-- ── 2. check_user_exists — callable without a session ────────────────────────
create or replace function check_user_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.users where lower(email) = lower(p_email)
  );
$$;

-- Allow frontend to call this before the user is logged in
grant execute on function check_user_exists(text) to anon, authenticated;

-- ── 3. Backfill profiles for any auth.users without a public.users row ────────
do $$
declare
  u          record;
  new_org_id uuid;
  _name      text;
  _slug      text;
begin
  for u in
    select id, email, raw_user_meta_data
    from auth.users
    where id not in (select id from public.users)
  loop
    begin
      _name := coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        split_part(u.email, '@', 1)
      );
      _slug := lower(regexp_replace(_name, '[^a-z0-9]+', '-', 'g'))
               || '-' || replace(u.id::text, '-', '');

      insert into organisations (name, slug)
      values (_name || '''s workspace', _slug)
      on conflict (slug) do update set name = excluded.name
      returning id into new_org_id;

      insert into users (id, org_id, email, full_name, role)
      values (u.id, new_org_id, u.email, _name, 'researcher')
      on conflict (id) do nothing;

    exception when others then
      raise notice '[backfill] skipped %: %', u.email, sqlerrm;
    end;
  end loop;
end $$;
