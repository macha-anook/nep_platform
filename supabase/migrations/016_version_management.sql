-- ============================================================
-- NEP Platform — Continuous Draft Version Management
-- Migration: 016_version_management
-- Phase 7 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Most of this feature already exists from 002_papers_schema.sql:
--   - "Never overwrite previous versions": paper_versions has no UPDATE
--     RLS policy at all — only publish_paper_draft/create_paper_revision
--     (security definer) can write it, and only via INSERT.
--   - "Maintain complete draft repository": every paper_versions row is
--     kept forever (only a manual delete removes one).
--   - "Current working draft": paper_drafts.
-- What's missing is restoring an OLDER version (create_paper_revision only
-- branches from the CURRENT one) — this migration adds that as the one new
-- piece of backend needed; version comparison and the chronological
-- timeline are pure UI over data that already exists.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: restore_paper_version(version_id)
--   Creates a new draft branched from an ARBITRARY past version (not just
--   the current one) — "restoration" means branching a fresh, editable
--   draft from old content, never rewriting history. Same locking/next-
--   version-number logic as create_paper_revision.
-- ─────────────────────────────────────────────────────────────
create or replace function restore_paper_version(p_version_id uuid)
returns paper_drafts
language plpgsql
security definer
as $$
declare
  v_version     paper_versions;
  v_paper       papers;
  v_next_ver    int;
  v_draft       paper_drafts;
  v_user_id     uuid;
begin
  select auth.uid() into v_user_id;

  select * into v_version from paper_versions where id = p_version_id;
  if not found then
    raise exception 'Version % not found', p_version_id;
  end if;

  select * into v_paper from papers where id = v_version.paper_id;
  if not found then
    raise exception 'Paper % not found', v_version.paper_id;
  end if;

  select coalesce(max(version_number), 0) + 1
  into   v_next_ver
  from   paper_versions
  where  paper_id = v_version.paper_id;

  insert into paper_drafts (
    paper_id, org_id,
    source_version_id, source_version_number,
    next_version_number,
    html_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    created_by
  ) values (
    v_version.paper_id, v_version.org_id,
    v_version.id, v_version.version_number,
    v_next_ver,
    v_version.html_content, v_version.file_name, v_version.file_data, v_version.file_size,
    v_paper.title, v_paper.compound,
    'Restored from v' || v_version.version_number,
    v_version.metadata,
    v_user_id
  )
  returning * into v_draft;

  return v_draft;
end;
$$;
grant execute on function restore_paper_version to authenticated;
