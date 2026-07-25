-- ============================================================
-- NEP Platform — Stop auto-assigning a role to brand-new users
-- Migration: 011_new_users_no_default_role
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Migration 005 changed handle_new_user() to default role to
-- 'researcher' whenever signup metadata didn't specify one. That
-- broke new-vs-existing detection: the frontend infers "new user
-- who needs the Registration screen" from role NOT IN
-- ('doctor','researcher') (see needsRole in adapters/supabase.js).
-- Because every brand-new signup already got 'researcher' stamped
-- by the trigger, OTP verification and Google OAuth for a NEW email
-- both looked identical to an existing user — the app logged them
-- straight in instead of routing to Registration.
--
-- Fix: leave role NULL for brand-new signups (still honouring an
-- explicit role in raw_user_meta_data, used by the doctor-invite
-- flow). completeProfile() sets the real role once the user
-- finishes Registration. Existing users already onboarded keep
-- their role untouched.
-- ============================================================

-- role must be nullable to represent "not yet chosen" — NULL still
-- satisfies the users_role_check CHECK constraint from 006 (a NULL
-- comparison result doesn't violate a CHECK).
alter table users alter column role drop not null;

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

  _slug := lower(regexp_replace(_name, '[^a-z0-9]+', '-', 'g'))
           || '-' || replace(new.id::text, '-', '');

  -- No default here on purpose: NULL means "hasn't picked a role yet"
  -- and drives the frontend's Registration/RoleSetup screen.
  _role := nullif(new.raw_user_meta_data->>'role', '');
  if _role is not null and _role not in ('researcher', 'doctor') then
    _role := null;
  end if;

  insert into organisations (name, slug)
  values (_name || '''s workspace', _slug)
  on conflict (slug) do update set name = excluded.name
  returning id into new_org_id;

  insert into users (id, org_id, email, full_name, role)
  values (new.id, new_org_id, new.email, _name, _role)
  on conflict (id) do nothing;

  return new;
exception when others then
  raise warning '[handle_new_user] failed for %: %', new.email, sqlerrm;
  return new;
end;
$$;
