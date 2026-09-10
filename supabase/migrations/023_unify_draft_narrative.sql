-- ============================================================
-- NEP Platform — Unify Draft Generation onto One Template
-- Migration: 023_unify_draft_narrative
-- Completes feature #2 (AI Draft Research Paper Generation) and #3
-- (AI Generated Preface) as one coherent pipeline, per the
-- fix/draft-preface-full-cycle plan.
--
-- Problem being fixed: draft_sections/reconciliation_apply (ai-generate)
-- wrote a full free-text html_content blob, disconnected from the
-- deterministic, computed-data-driven .docx template (buildDocxBlob,
-- src/App.jsx) that researchers actually use, download, and have
-- practitioners review. AI-authored content must be narrative-only
-- (Introduction/Discussion/Conclusions) and clearly separated from
-- computed content (Abstract stats, Results tables) that must always
-- come from live outcome/scoring data, never from the AI.
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table paper_drafts add column if not exists narrative_content jsonb;
comment on column paper_drafts.narrative_content is
  'AI-authored narrative fragments: {introduction, discussion, bioavailability, '
  'conclusions} — discussion/bioavailability are the two narrative subsections '
  'of the paper''s Discussion section (4.1/4.2 in buildDocxBlob); the rest of '
  'Discussion (4.3-4.5) and all of Abstract/Methods/Results are always '
  're-rendered client-side from live outcome/scoring data (buildDocxBlob) — '
  'never stored here, never written by AI.';

-- restore_draft_version (022_draft_version_integrity.sql) predates
-- narrative_content — redefined here, identical otherwise, so restoring an
-- old draft version also carries its narrative forward instead of silently
-- dropping it. Also reused by the client as the "branch a new draft version
-- from the current one" primitive for "Regenerate with AI" (the client
-- immediately overwrites the branched row's file_data/narrative_content
-- with freshly generated content — file_data/narrative_content/notes are
-- not protected by the identity-guard trigger, only version/lineage columns are).
create or replace function restore_draft_version(p_draft_id uuid)
returns paper_drafts
language plpgsql security definer as $$
declare
  v_old paper_drafts;
  v_new paper_drafts;
begin
  select * into v_old from paper_drafts where id = p_draft_id;
  if not found then
    raise exception 'Draft version % not found', p_draft_id;
  end if;

  insert into paper_drafts (
    paper_id, org_id,
    source_version_id, source_version_number, next_version_number,
    html_content, narrative_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    source, preface_id, based_on_draft_id, created_by
  ) values (
    v_old.paper_id, v_old.org_id,
    v_old.source_version_id, v_old.source_version_number, v_old.next_version_number,
    v_old.html_content, v_old.narrative_content, v_old.file_name, v_old.file_data, v_old.file_size,
    v_old.title, v_old.compound,
    'Restored from Draft V' || v_old.draft_version_number,
    v_old.metadata,
    'manual', v_old.preface_id, v_old.id, auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$$;
grant execute on function restore_draft_version to authenticated;
