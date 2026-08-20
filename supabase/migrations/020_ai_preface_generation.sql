-- ============================================================
-- NEP Platform — AI Generated Preface / Executive Summary
-- Migration: 020_ai_preface_generation
-- Phase 3 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- job_type='preface' already existed in ai_jobs' CHECK constraint since
-- migration 013 (written forward-looking for this phase) — no ALTER needed
-- there. This migration only adds the paper_prefaces table itself.
-- ============================================================

create table paper_prefaces (
  id                uuid primary key default uuid_generate_v4(),
  paper_id          uuid not null references papers(id) on delete cascade,
  org_id            uuid not null references organisations(id) on delete cascade,
  version_number    int not null,
  -- Snapshot of whichever draft/version existed at generation time — "the
  -- relationship between preface versions and paper versions" the brief
  -- asks for. Nullable + ON DELETE SET NULL since the linked draft can be
  -- published (deleted) or the version can later be removed; the preface
  -- content itself is self-contained and survives either.
  linked_draft_id   uuid references paper_drafts(id) on delete set null,
  linked_version_id uuid references paper_versions(id) on delete set null,
  -- Structured content — the 8 required sections as named jsonb keys, not
  -- freeform HTML, since this is metadata/guidance rather than manuscript
  -- prose: overview, problem_statement, motivation, objectives, scope,
  -- methodology, expected_contributions, reviewer_guidance.
  content           jsonb not null default '{}',
  generated_by      text not null default 'ai' check (generated_by in ('ai','manual')),
  ai_job_id         uuid references ai_jobs(id) on delete set null,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (paper_id, version_number)
);
create index idx_prefaces_paper on paper_prefaces(paper_id);

alter table paper_prefaces enable row level security;
create policy "prefaces_org_all" on paper_prefaces
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());

-- "Reviewer guidance" in the preface is literally addressed to the
-- practitioners reviewing the draft — give them read access the same way
-- they already read the draft itself (paper_drafts_practitioner_via_invite,
-- migration 014).
create policy "prefaces_practitioner_select" on paper_prefaces
  for select using (exists (
    select 1 from paper_review_invitations i
    where i.paper_id = paper_prefaces.paper_id and lower(i.practitioner_email) = lower(nep_current_email())
  ));
