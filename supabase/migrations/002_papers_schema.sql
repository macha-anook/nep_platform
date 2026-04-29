-- ============================================================
-- NEP Platform — Paper Management Schema
-- Migration: 002_papers_schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Tables:
--   papers          — one row per logical paper (group identity)
--   paper_versions  — immutable published snapshots (v1, v2, v3…)
--   paper_drafts    — editable work-in-progress entries
--
-- Design decisions:
--   • published versions are NEVER modified after creation
--   • version_number is computed from MAX(version_number)+1 via DB function
--   • drafts reference the source version they were branched from
--   • all tables are scoped to org_id for Row Level Security
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PAPERS  (logical paper group — one per title/compound pair)
-- ─────────────────────────────────────────────────────────────
create table if not exists papers (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organisations(id) on delete cascade,
  project_id          uuid references projects(id) on delete set null,
  title               text not null default '',
  compound            text not null default '',
  -- Denormalised for fast list queries
  current_version     int  not null default 0,          -- 0 = no published version yet
  latest_version_id   uuid,                              -- FK added after paper_versions
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- PAPER_VERSIONS  (immutable published snapshots)
-- ─────────────────────────────────────────────────────────────
create table if not exists paper_versions (
  id                  uuid primary key default uuid_generate_v4(),
  paper_id            uuid not null references papers(id) on delete cascade,
  org_id              uuid not null references organisations(id) on delete cascade,
  version_number      int  not null,
  html_content        text not null default '',
  -- Original generated file (base64 Data-URL so no Storage bucket needed)
  file_name           text not null default '',
  file_data           text not null default '',     -- base64 docx Data-URL
  file_size           bigint not null default 0,
  -- Version lineage
  based_on_version    int,                          -- null for v1; N for vN+1 drafts
  -- Metadata snapshot at publish time
  metadata            jsonb not null default '{}', -- {team, affiliation, journal, keywords, …}
  notes               text not null default '',
  is_current          boolean not null default false,
  published_at        timestamptz not null default now(),
  created_by          uuid references users(id) on delete set null,
  -- Enforce one version_number per paper
  unique (paper_id, version_number)
);

-- Back-fill the FK now that paper_versions exists
alter table papers
  add constraint papers_latest_version_id_fkey
  foreign key (latest_version_id) references paper_versions(id) on delete set null
  deferrable initially deferred;

-- ─────────────────────────────────────────────────────────────
-- PAPER_DRAFTS  (editable work-in-progress)
-- ─────────────────────────────────────────────────────────────
create table if not exists paper_drafts (
  id                    uuid primary key default uuid_generate_v4(),
  paper_id              uuid not null references papers(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,
  -- Lineage — which published version this draft was branched from (null = brand-new)
  source_version_id     uuid references paper_versions(id) on delete set null,
  source_version_number int,
  -- The version number this draft will become when published (computed dynamically)
  next_version_number   int  not null,
  -- Content
  html_content          text not null default '',
  file_name             text not null default '',
  file_data             text not null default '',   -- base64 docx Data-URL
  file_size             bigint not null default 0,
  -- Editable metadata
  title                 text not null default '',
  compound              text not null default '',
  notes                 text not null default '',
  metadata              jsonb not null default '{}',
  status                text not null default 'draft'
                          check (status in ('draft')),
  created_by            uuid references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_papers_org          on papers(org_id);
create index if not exists idx_papers_project      on papers(project_id);
create index if not exists idx_paper_versions_paper on paper_versions(paper_id);
create index if not exists idx_paper_versions_org   on paper_versions(org_id);
create index if not exists idx_paper_versions_cur   on paper_versions(paper_id, is_current);
create index if not exists idx_paper_drafts_paper   on paper_drafts(paper_id);
create index if not exists idx_paper_drafts_org     on paper_drafts(org_id);

-- ─────────────────────────────────────────────────────────────
-- HELPER: updated_at auto-stamp
-- ─────────────────────────────────────────────────────────────
create or replace function nep_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger tg_papers_updated_at
  before update on papers
  for each row execute function nep_set_updated_at();

create trigger tg_paper_drafts_updated_at
  before update on paper_drafts
  for each row execute function nep_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: get_next_paper_version(paper_id)
--   Returns MAX(version_number)+1 for the paper, or 1 if none exist.
--   Called before inserting a new version to guarantee monotonic numbering
--   even under concurrent requests.
-- ─────────────────────────────────────────────────────────────
create or replace function get_next_paper_version(p_paper_id uuid)
returns int
language sql
stable
as $$
  select coalesce(max(version_number), 0) + 1
  from   paper_versions
  where  paper_id = p_paper_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: publish_paper_draft(draft_id)
--   Atomically:
--     1. Reads the draft
--     2. Computes the next version number (MAX+1, advisory-locks paper row)
--     3. Inserts a new paper_version row (immutable)
--     4. Marks all previous versions is_current = false
--     5. Sets the new version is_current = true
--     6. Updates papers.current_version and latest_version_id
--     7. Deletes the draft
--     8. Returns the new paper_version row
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
  -- Lock the draft row to prevent concurrent publishes
  select * into v_draft from paper_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft % not found', p_draft_id;
  end if;

  -- Advisory lock on the paper to serialise version numbering
  perform pg_advisory_xact_lock(('x' || md5(v_draft.paper_id::text))::bit(64)::bigint);

  -- Compute next version number inside the lock
  select coalesce(max(version_number), 0) + 1
  into   v_next_ver
  from   paper_versions
  where  paper_id = v_draft.paper_id;

  -- Clear current flag on all previous versions
  update paper_versions
  set    is_current = false
  where  paper_id = v_draft.paper_id and is_current = true;

  -- Insert the immutable version record
  insert into paper_versions (
    paper_id, org_id, version_number,
    html_content, file_name, file_data, file_size,
    based_on_version, metadata, notes, is_current,
    published_at, created_by
  ) values (
    v_draft.paper_id, v_draft.org_id, v_next_ver,
    v_draft.html_content, v_draft.file_name, v_draft.file_data, v_draft.file_size,
    v_draft.source_version_number, v_draft.metadata, v_draft.notes, true,
    now(), v_draft.created_by
  )
  returning * into v_version;

  -- Update the paper group record
  update papers
  set    current_version   = v_next_ver,
         latest_version_id = v_version.id,
         title             = v_draft.title,
         compound          = v_draft.compound,
         updated_at        = now()
  where  id = v_draft.paper_id;

  -- Remove the draft (it is now a published version)
  delete from paper_drafts where id = p_draft_id;

  return v_version;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: create_paper_revision(paper_id)
--   Creates a new draft branched from the latest published version.
--   The next_version_number is computed dynamically (MAX+1).
--   Returns the new paper_drafts row.
-- ─────────────────────────────────────────────────────────────
create or replace function create_paper_revision(p_paper_id uuid)
returns paper_drafts
language plpgsql
security definer
as $$
declare
  v_latest      paper_versions;
  v_next_ver    int;
  v_draft       paper_drafts;
  v_paper       papers;
  v_user_id     uuid;
begin
  select auth.uid() into v_user_id;

  select * into v_paper from papers where id = p_paper_id;
  if not found then
    raise exception 'Paper % not found', p_paper_id;
  end if;

  -- Get the current published version
  select * into v_latest from paper_versions
  where  paper_id = p_paper_id and is_current = true
  limit  1;

  if not found then
    raise exception 'No published version found for paper %', p_paper_id;
  end if;

  -- Compute the next version number
  select coalesce(max(version_number), 0) + 1
  into   v_next_ver
  from   paper_versions
  where  paper_id = p_paper_id;

  -- Create the draft
  insert into paper_drafts (
    paper_id, org_id,
    source_version_id, source_version_number,
    next_version_number,
    html_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    created_by
  ) values (
    p_paper_id, v_latest.org_id,
    v_latest.id, v_latest.version_number,
    v_next_ver,
    v_latest.html_content, v_latest.file_name, v_latest.file_data, v_latest.file_size,
    v_paper.title, v_paper.compound, '', v_latest.metadata,
    v_user_id
  )
  returning * into v_draft;

  return v_draft;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table papers         enable row level security;
alter table paper_versions enable row level security;
alter table paper_drafts   enable row level security;

-- Helper: get the calling user's org_id without hitting users table every time
create or replace function nep_current_org_id()
returns uuid
language sql
stable
security definer
as $$
  select org_id from users where id = auth.uid();
$$;

-- papers
create policy "papers_org_read"   on papers for select
  using (org_id = nep_current_org_id());

create policy "papers_org_insert" on papers for insert
  with check (org_id = nep_current_org_id());

create policy "papers_org_update" on papers for update
  using (org_id = nep_current_org_id());

create policy "papers_org_delete" on papers for delete
  using (org_id = nep_current_org_id());

-- paper_versions (read + delete only — insert/update via security-definer function)
create policy "pv_org_read"   on paper_versions for select
  using (org_id = nep_current_org_id());

create policy "pv_org_delete" on paper_versions for delete
  using (org_id = nep_current_org_id());

-- paper_drafts
create policy "pd_org_read"   on paper_drafts for select
  using (org_id = nep_current_org_id());

create policy "pd_org_insert" on paper_drafts for insert
  with check (org_id = nep_current_org_id());

create policy "pd_org_update" on paper_drafts for update
  using (org_id = nep_current_org_id());

create policy "pd_org_delete" on paper_drafts for delete
  using (org_id = nep_current_org_id());
