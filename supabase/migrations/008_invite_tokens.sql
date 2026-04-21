-- ============================================================
-- NEP Platform — Invite Token System
-- Migration: 008_invite_tokens
-- Run after 007_backfill_users_fix_roles.sql in Supabase SQL Editor
-- ============================================================

-- Add secure token fields to study_invitations
alter table study_invitations
  add column if not exists token               text unique,
  add column if not exists token_expires_at    timestamptz,
  add column if not exists invite_status       text not null default 'pending',
  add column if not exists invited_by_user_id  uuid references users(id) on delete set null,
  add column if not exists last_sent_at        timestamptz;

-- Fast token lookups (partial index — only rows with a token)
create index if not exists idx_study_invitations_token
  on study_invitations(token)
  where token is not null;

-- ─────────────────────────────────────────────────────────────
-- validate_invite_token
-- Security-definer so it runs without an active session.
-- Called from the unauthenticated frontend before the doctor
-- has logged in — verifies the token is valid and not expired.
-- ─────────────────────────────────────────────────────────────
create or replace function validate_invite_token(
  p_study_id  uuid,
  p_token     text
)
returns table (
  valid        boolean,
  invite_id    uuid,
  doctor_email text,
  study_title  text,
  expires_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      (si.token_expires_at > now() and si.invite_status = 'pending') as valid,
      si.id                                                           as invite_id,
      si.doctor_email,
      cs.title                                                        as study_title,
      si.token_expires_at                                             as expires_at
    from study_invitations si
    join clinical_studies  cs on cs.id = si.study_id
    where si.study_id = p_study_id
      and si.token    = p_token
    limit 1;
end;
$$;

-- Allow unauthenticated and authenticated callers to validate tokens
grant execute on function validate_invite_token(uuid, text)
  to anon, authenticated;
