-- ============================================================
-- NEP Platform — Backfill missing users + fix legacy roles
-- Migration: 007_backfill_users_fix_roles
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Fixes three issues:
--   1. auth.users rows that have no matching public.users row
--      (trigger failed or was added after initial signups)
--   2. public.users rows with role = 'owner' (legacy placeholder)
--      which the platform cannot route correctly
--   3. Ensures handle_new_user trigger reads role from metadata
--      (idempotent re-apply of migration 005 logic)
-- ============================================================

-- ── Step 1: Fix existing rows with legacy role = 'owner' ───────────────────
update users set role = 'researcher' where role not in ('doctor', 'researcher');

-- ── Step 2: Backfill any auth.users that have no public.users row ──────────
-- For each orphaned auth user, create an org and a users row.
-- Role is read from raw_user_meta_data->>'role'; defaults to 'researcher'.
do $$
declare
  rec       record;
  new_org   uuid;
  _slug     text;
  _role     text;
  _name     text;
begin
  for rec in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    left join public.users pu on pu.id = au.id
    where pu.id is null
  loop
    _name := coalesce(
      rec.raw_user_meta_data->>'full_name',
      split_part(rec.email, '@', 1)
    );
    _slug := lower(replace(_name, ' ', '-'))
             || '-' || substr(rec.id::text, 1, 8);

    _role := coalesce(nullif(rec.raw_user_meta_data->>'role', ''), 'researcher');
    if _role not in ('researcher', 'doctor') then
      _role := 'researcher';
    end if;

    -- Create org (skip if slug already taken — shouldn't happen, but be safe)
    begin
      insert into organisations (name, slug)
      values (_name || '''s workspace', _slug)
      returning id into new_org;
    exception when unique_violation then
      -- Slug collision: append more of the UUID
      insert into organisations (name, slug)
      values (
        _name || '''s workspace',
        _slug || '-' || substr(rec.id::text, 9, 4)
      )
      returning id into new_org;
    end;

    insert into users (id, org_id, email, full_name, role)
    values (rec.id, new_org, rec.email, _name, _role)
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ── Step 3: Re-apply the definitive handle_new_user trigger ────────────────
-- Reads role from metadata, defaults to 'researcher', rejects unknown roles.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  _slug      text;
  _role      text;
  _name      text;
begin
  _name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  _slug := lower(replace(_name, ' ', '-')) || '-' || substr(new.id::text, 1, 8);

  _role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'researcher');
  if _role not in ('researcher', 'doctor') then
    _role := 'researcher';
  end if;

  begin
    insert into organisations (name, slug)
    values (_name || '''s workspace', _slug)
    returning id into new_org_id;
  exception when unique_violation then
    insert into organisations (name, slug)
    values (_name || '''s workspace', _slug || '-' || substr(new.id::text, 9, 4))
    returning id into new_org_id;
  end;

  insert into users (id, org_id, email, full_name, role)
  values (new.id, new_org_id, new.email, _name, _role)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Also re-fix auth_org_id helper (idempotent)
create or replace function auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from users where id = auth.uid();
$$;
