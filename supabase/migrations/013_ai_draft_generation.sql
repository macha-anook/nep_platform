-- ============================================================
-- NEP Platform — AI Draft Generation
-- Migration: 013_ai_draft_generation
-- Phase 2 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- AI JOBS
-- Generalises the generated_papers job/poll shape for AI-driven work.
-- job_type covers this phase (draft_sections) and later phases (preface,
-- reconciliation) so those reuse this table instead of new bespoke ones.
-- ─────────────────────────────────────────────────────────────
create table ai_jobs (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organisations(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  paper_id       uuid references papers(id) on delete set null,
  job_type       text not null check (job_type in ('draft_sections','preface','reconciliation')),
  status         text not null default 'pending' check (status in ('pending','running','done','error')),
  stage          int not null default 1,
  pct            int not null default 0,
  log            jsonb not null default '[]',
  input_ref      jsonb not null default '{}',
  output_ref     jsonb,
  model          text,
  prompt_version text,
  error_message  text,
  created_by     uuid references users(id),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index idx_ai_jobs_org on ai_jobs(org_id);
create index idx_ai_jobs_project on ai_jobs(project_id);

alter table ai_jobs enable row level security;
create policy "ai_jobs_org_read" on ai_jobs for select
  using (org_id = nep_current_org_id());
create policy "ai_jobs_org_insert" on ai_jobs for insert
  with check (org_id = nep_current_org_id());
-- No update/delete policy for regular clients — the ai-generate Edge Function
-- advances status/log via its service-role client, same trust model already
-- used for paper_versions (writes only through a privileged path).

-- ─────────────────────────────────────────────────────────────
-- DRAFT / VERSION PROVENANCE
-- Tags who/what produced a draft or version, and links an AI-produced draft
-- back to the job that generated it.
-- ─────────────────────────────────────────────────────────────
alter table paper_drafts
  add column if not exists source text not null default 'manual'
    check (source in ('manual','ai_draft','ai_preface','reconciliation')),
  add column if not exists ai_job_id uuid references ai_jobs(id) on delete set null;

alter table paper_versions
  add column if not exists source text not null default 'manual'
    check (source in ('manual','ai_draft','ai_preface','reconciliation'));

-- ─────────────────────────────────────────────────────────────
-- publish_paper_draft: carry `source` from the draft into the immutable
-- version it produces, so published history keeps provenance. Identical to
-- the 002_papers_schema.sql definition otherwise — no other behaviour change.
-- ─────────────────────────────────────────────────────────────
create or replace function publish_paper_draft(p_draft_id uuid)
returns paper_versions
language plpgsql
security definer
as $$
declare
  v_draft       paper_drafts;
  v_next_ver    int;
  v_version     paper_versions;
begin
  select * into v_draft from paper_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft % not found', p_draft_id;
  end if;

  perform pg_advisory_xact_lock(('x' || md5(v_draft.paper_id::text))::bit(64)::bigint);

  select coalesce(max(version_number), 0) + 1
  into   v_next_ver
  from   paper_versions
  where  paper_id = v_draft.paper_id;

  update paper_versions
  set    is_current = false
  where  paper_id = v_draft.paper_id and is_current = true;

  insert into paper_versions (
    paper_id, org_id, version_number,
    html_content, file_name, file_data, file_size,
    based_on_version, metadata, notes, is_current,
    published_at, created_by, source
  ) values (
    v_draft.paper_id, v_draft.org_id, v_next_ver,
    v_draft.html_content, v_draft.file_name, v_draft.file_data, v_draft.file_size,
    v_draft.source_version_number, v_draft.metadata, v_draft.notes, true,
    now(), v_draft.created_by, v_draft.source
  )
  returning * into v_version;

  update papers
  set    current_version   = v_next_ver,
         latest_version_id = v_version.id,
         title             = v_draft.title,
         compound          = v_draft.compound,
         updated_at        = now()
  where  id = v_draft.paper_id;

  delete from paper_drafts where id = p_draft_id;

  return v_version;
end;
$$;
