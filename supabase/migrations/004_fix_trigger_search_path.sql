-- ============================================================
-- NEP Platform — Fix handle_new_user trigger search path
-- Migration: 004_fix_trigger_search_path
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Without `set search_path = public`, security definer functions
-- run in an empty search path and cannot resolve table names,
-- causing "Database error saving new user" on OTP/signup.
-- ============================================================

-- Fix auth_org_id helper (used by all RLS policies)
create or replace function auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from users where id = auth.uid();
$$;

-- Fix the new-user provisioning trigger
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  _slug      text;
begin
  -- Build a unique slug: name-fragment + first 8 chars of UUID
  _slug := lower(
    replace(
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      ' ', '-'
    )
  ) || '-' || substr(new.id::text, 1, 8);

  -- Create a new org for this user
  insert into organisations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace',
    _slug
  )
  returning id into new_org_id;

  -- Create the public.users profile row
  insert into users (id, org_id, email, full_name, role)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  )
  on conflict (id) do nothing;   -- idempotent: ignore if profile already exists

  return new;
end;
$$;
