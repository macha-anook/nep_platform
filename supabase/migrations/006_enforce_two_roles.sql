-- ============================================================
-- NEP Platform — Enforce two-role system: doctor | researcher
-- Migration: 006_enforce_two_roles
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Collapses legacy roles (owner, admin) to 'researcher',
-- then adds a CHECK constraint so only 'doctor' and 'researcher'
-- are ever valid values going forward.
-- ============================================================

-- Collapse any remaining legacy roles
update users set role = 'researcher' where role not in ('doctor', 'researcher');

-- Add CHECK constraint to enforce two-role system
alter table users
  add constraint users_role_check check (role in ('doctor', 'researcher'));
