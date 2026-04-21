-- Migration 010: add co_authors and research_team to projects
-- Fixes PGRST204 when creating projects that include these fields.

alter table projects
  add column if not exists co_authors   text,
  add column if not exists research_team jsonb not null default '[]'::jsonb;
