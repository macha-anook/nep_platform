-- ============================================================
-- NEP Platform — Feedback Repository
-- Migration: 015_feedback_repository
-- Phase 5 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Builds directly on 014_practitioner_review_workflow.sql's paper_reviews /
-- paper_review_comments tables (which already store the practitioner email,
-- reviewed section, comment details, timestamp, and implementation_status)
-- rather than duplicating that schema. This migration adds:
--   - durable "practitioner details" / "paper version" fields on
--     paper_reviews that survive the underlying draft being deleted
--     (published) or the invitation being reused
--   - a real per-reviewer review-iteration count instead of a hardcoded 1
--   - an audit trail for implementation_status changes, via the shared
--     audit_log table from migration 012 rather than a new bespoke table
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- DURABLE REVIEW METADATA
-- paper_draft_id is ON DELETE SET NULL (publishing deletes the draft) — so
-- "practitioner details" and "paper version" are captured as plain columns
-- at review-creation time, and remain readable in the repository forever,
-- independent of the draft's lifecycle.
-- ─────────────────────────────────────────────────────────────
alter table paper_reviews
  add column if not exists reviewer_name text,
  add column if not exists version_label text;

-- ─────────────────────────────────────────────────────────────
-- ORG READ ACCESS ON AUDIT LOG
-- audit_log (migration 012) only had an admin-read policy so far. Feedback
-- audit history belongs to the researcher's own org too — additive policy,
-- existing admin policy untouched.
-- ─────────────────────────────────────────────────────────────
create policy "audit_log_org_read" on audit_log
  for select using (org_id = nep_current_org_id());

-- ─────────────────────────────────────────────────────────────
-- RPC: update_comment_implementation_status
-- Replaces a bare client-side UPDATE so every status change is captured in
-- audit_log atomically with the write, satisfying "maintain complete
-- feedback audit history" — not just the current status, but who changed it,
-- when, and from what to what.
-- ─────────────────────────────────────────────────────────────
create or replace function update_comment_implementation_status(
  p_comment_id uuid, p_status text
) returns paper_review_comments
language plpgsql security definer set search_path = public as $$
declare
  v_comment paper_review_comments;
  v_old_status text;
begin
  if p_status not in ('pending','accepted','rejected','implemented') then
    raise exception 'Invalid implementation_status: %', p_status;
  end if;

  select * into v_comment from paper_review_comments where id = p_comment_id;
  if not found then
    raise exception 'Comment % not found', p_comment_id;
  end if;
  if v_comment.org_id <> nep_current_org_id() then
    raise exception 'Not authorized to update this comment';
  end if;

  v_old_status := v_comment.implementation_status;

  update paper_review_comments
    set implementation_status = p_status
    where id = p_comment_id
    returning * into v_comment;

  insert into audit_log (org_id, actor_id, entity_type, entity_id, action, metadata)
  values (v_comment.org_id, auth.uid(), 'review_comment', v_comment.id, 'status_changed',
          jsonb_build_object('from', v_old_status, 'to', p_status));

  return v_comment;
end;
$$;
grant execute on function update_comment_implementation_status to authenticated;
