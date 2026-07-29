-- ============================================================
-- NEP Platform — Papers module: versioning + real file storage
-- Migration: 012_paper_versions
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- generated_papers previously held only async-generation-job rows
-- (status/stage/pct/log). The Papers tab's draft/publish/revision
-- UI (PapersPanel in App.jsx) only ever lived in React state — it
-- was wiped on every refresh. This migration extends the same
-- table so a job row can be "finalized" into a versioned paper,
-- and provisions real Storage (previously only base64 blobs in
-- memory/localStorage) for the generated/uploaded .docx files.
-- ============================================================

alter table generated_papers
  add column if not exists title           text,
  add column if not exists compound_name   text,
  add column if not exists paper_status    text not null default 'in_progress'
    check (paper_status in ('in_progress', 'published')),
  add column if not exists version         text not null default '1.0',
  add column if not exists notes           text,
  add column if not exists history         jsonb not null default '[]',
  add column if not exists published_at    timestamptz,
  add column if not exists parent_paper_id uuid references generated_papers(id) on delete set null,
  add column if not exists file_name       text,
  add column if not exists file_size       integer,
  add column if not exists file_type       text,
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists idx_papers_project_status
  on generated_papers(project_id, paper_status);

create trigger trg_papers_updated
  before update on generated_papers
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- STORAGE: private bucket for generated/uploaded paper files
-- Objects are keyed "{org_id}/{paper_id}.ext" so RLS can scope
-- access purely from the path, same org-scoping pattern used by
-- every table's RLS policy below.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('papers', 'papers', false)
on conflict (id) do nothing;

create policy "papers_storage_own_org"
  on storage.objects for all
  using (bucket_id = 'papers' and (storage.foldername(name))[1] = auth_org_id()::text)
  with check (bucket_id = 'papers' and (storage.foldername(name))[1] = auth_org_id()::text);
