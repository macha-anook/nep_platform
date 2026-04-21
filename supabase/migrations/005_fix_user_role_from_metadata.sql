-- ============================================================
-- NEP Platform — Fix handle_new_user: use role from metadata
-- Migration: 005_fix_user_role_from_metadata
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Previously the trigger hardcoded 'owner' for all new users.
-- Now it reads the intended role from raw_user_meta_data->>'role',
-- defaulting to 'researcher' if not provided.
-- Also updates existing 'owner' rows to 'researcher' since
-- 'owner' was only ever a trigger placeholder, not a real role.
-- ============================================================

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
begin
  _slug := lower(
    replace(
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      ' ', '-'
    )
  ) || '-' || substr(new.id::text, 1, 8);

  -- Use role from signup metadata; fall back to 'researcher'
  _role := coalesce(
    nullif(new.raw_user_meta_data->>'role', ''),
    'researcher'
  );
  -- Only allow known roles
  if _role not in ('researcher', 'doctor') then
    _role := 'researcher';
  end if;

  insert into organisations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace',
    _slug
  )
  returning id into new_org_id;

  insert into users (id, org_id, email, full_name, role)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    _role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Fix existing accounts: 'owner' was the trigger placeholder — treat as 'researcher'
update users set role = 'researcher' where role = 'owner';
