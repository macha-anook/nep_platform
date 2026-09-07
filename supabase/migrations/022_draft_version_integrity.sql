-- ============================================================
-- NEP Platform — Explicit Draft Version Integrity
-- Migration: 022_draft_version_integrity
-- Completes Features #2/#3/#6/#7 as one integrated workflow.
--
-- Problem being fixed: paper_drafts has been doing double duty as both
-- "the mutable current working copy" (title/notes/file_data edits via
-- updatePaperDraft, the "Edit in Word" flow) AND "an immutable AI-generated
-- version" (draft_sections / reconciliation_apply always INSERT, never
-- UPDATE, in practice) — with no explicit column making that distinction,
-- no stable per-paper version number independent of publish status, and no
-- FK from a draft to the preface that produced it. This migration adds
-- exactly those three things, via triggers so every existing and future
-- insert path (createPaperDraft, createPaperRevision, ai-generate,
-- restore_draft_version below) gets correct values automatically —
-- no application code has to compute them itself.
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- NEW COLUMNS
-- draft_version_number: stable "Draft V1/V2/V3/V4" identity, independent of
--   next_version_number (which remains "what PUBLISHED version this would
--   become" — a different, pre-existing concept, untouched).
-- preface_id: explicit FK answering "which preface was used to generate
--   this exact draft version" without a "latest preface" query.
-- based_on_draft_id: lineage — which prior draft (if any) this one
--   supersedes (e.g. a reconciliation-generated draft points at the draft
--   it revised).
-- is_current: convenience pointer to "the current working version" — NOT
--   the versioning mechanism itself (draft_version_number is), maintained
--   automatically by trigger, mirroring how paper_versions.is_current
--   already works alongside its own explicit version_number.
-- ─────────────────────────────────────────────────────────────
alter table paper_drafts
  add column if not exists draft_version_number int,
  add column if not exists preface_id uuid references paper_prefaces(id) on delete set null,
  add column if not exists based_on_draft_id uuid references paper_drafts(id) on delete set null,
  add column if not exists is_current boolean not null default true;

-- Backfill existing rows: assign a stable per-paper sequence from creation
-- order, and mark only the newest per paper as current.
with numbered as (
  select id, row_number() over (partition by paper_id order by created_at) as rn
  from paper_drafts
  where draft_version_number is null
)
update paper_drafts d
  set draft_version_number = numbered.rn
  from numbered
  where d.id = numbered.id;

update paper_drafts d
  set is_current = (d.id = latest.id)
  from (
    select distinct on (paper_id) id, paper_id
    from paper_drafts
    order by paper_id, draft_version_number desc
  ) latest
  where d.paper_id = latest.paper_id;

alter table paper_drafts alter column draft_version_number set not null;
create unique index if not exists idx_paper_drafts_version_unique on paper_drafts(paper_id, draft_version_number);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: stamp draft_version_number server-side on every insert,
-- regardless of which code path (existing createPaperDraft/
-- createPaperRevision, ai-generate, or restore_draft_version below)
-- performs it — the numbering can never be wrong or skipped because no
-- application code computes it.
-- ─────────────────────────────────────────────────────────────
create or replace function nep_stamp_draft_version() returns trigger
language plpgsql as $$
begin
  -- Same advisory-lock-per-paper pattern publish_paper_draft already uses
  -- (migration 002/013) to serialise version numbering under concurrent
  -- writes for the same paper — without it, two simultaneous draft
  -- creations for one paper could both compute the same next number.
  perform pg_advisory_xact_lock(('x' || md5(new.paper_id::text))::bit(64)::bigint);
  new.draft_version_number := coalesce(
    (select max(draft_version_number) from paper_drafts where paper_id = new.paper_id), 0
  ) + 1;
  return new;
end;
$$;
create trigger trg_stamp_draft_version
  before insert on paper_drafts
  for each row execute function nep_stamp_draft_version();

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: after a new draft is inserted, it becomes the current working
-- version and every sibling draft for the same paper is no longer current.
-- ─────────────────────────────────────────────────────────────
create or replace function nep_unset_other_current_drafts() returns trigger
language plpgsql as $$
begin
  update paper_drafts set is_current = false
    where paper_id = new.paper_id and id <> new.id and is_current = true;
  return new;
end;
$$;
create trigger trg_unset_other_current_drafts
  after insert on paper_drafts
  for each row execute function nep_unset_other_current_drafts();

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: protect version identity/lineage from ever being rewritten.
-- title/compound/notes/file_data/metadata/is_current remain freely
-- editable (the legitimate "Edit in Word" / status-tracking flows), but
-- draft_version_number, based_on_draft_id, paper_id and org_id are fixed at
-- creation. preface_id may be filled in exactly once from null (the
-- createPaperDraft path inserts the draft before the auto-generated
-- preface exists, then backfills this one column) but never changed once set.
-- ─────────────────────────────────────────────────────────────
create or replace function nep_guard_draft_version_identity() returns trigger
language plpgsql as $$
begin
  if new.draft_version_number is distinct from old.draft_version_number then
    raise exception 'paper_drafts.draft_version_number is immutable';
  end if;
  if new.based_on_draft_id is distinct from old.based_on_draft_id then
    raise exception 'paper_drafts.based_on_draft_id is immutable';
  end if;
  if new.paper_id is distinct from old.paper_id or new.org_id is distinct from old.org_id then
    raise exception 'paper_drafts.paper_id/org_id are immutable';
  end if;
  if old.preface_id is not null and new.preface_id is distinct from old.preface_id then
    raise exception 'paper_drafts.preface_id cannot be changed once set';
  end if;
  return new;
end;
$$;
create trigger trg_guard_draft_version_identity
  before update on paper_drafts
  for each row execute function nep_guard_draft_version_identity();

-- ─────────────────────────────────────────────────────────────
-- PREFACES: close the "do not overwrite Preface V1" gap — prefaces_org_all
-- (migration 020) granted UPDATE/DELETE to org members via a blanket ALL
-- policy. Replaced with SELECT + INSERT only; the practitioner SELECT
-- policy from 020 is untouched.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "prefaces_org_all" on paper_prefaces;
create policy "prefaces_org_select" on paper_prefaces
  for select using (org_id = nep_current_org_id());
create policy "prefaces_org_insert" on paper_prefaces
  for insert with check (org_id = nep_current_org_id());

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: restore_draft_version(draft_id)
--   "Previous version restoration" for the draft ledger, mirroring
--   restore_paper_version's exact pattern for paper_versions — branches a
--   new, current draft from an OLD draft's content rather than mutating
--   anything, so the old version stays exactly as it was.
-- ─────────────────────────────────────────────────────────────
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
    html_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    source, preface_id, based_on_draft_id, created_by
  ) values (
    v_old.paper_id, v_old.org_id,
    v_old.source_version_id, v_old.source_version_number, v_old.next_version_number,
    v_old.html_content, v_old.file_name, v_old.file_data, v_old.file_size,
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

-- ─────────────────────────────────────────────────────────────
-- create_paper_revision / restore_paper_version: extended (create or
-- replace, identical otherwise) to also stamp preface_id with whatever
-- preface is current for the paper — "a draft version MUST explicitly
-- identify the preface version used to generate it" is a blanket
-- requirement, not just for AI-generated drafts. Every other line below is
-- byte-for-byte the existing 002_papers_schema.sql / 016_version_management.sql
-- definition.
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
  v_preface_id  uuid;
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

  select id into v_preface_id from paper_prefaces
  where paper_id = p_paper_id order by version_number desc limit 1;

  -- Create the draft
  insert into paper_drafts (
    paper_id, org_id,
    source_version_id, source_version_number,
    next_version_number,
    html_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    preface_id, created_by
  ) values (
    p_paper_id, v_latest.org_id,
    v_latest.id, v_latest.version_number,
    v_next_ver,
    v_latest.html_content, v_latest.file_name, v_latest.file_data, v_latest.file_size,
    v_paper.title, v_paper.compound, '', v_latest.metadata,
    v_preface_id, v_user_id
  )
  returning * into v_draft;

  return v_draft;
end;
$$;

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
  v_preface_id  uuid;
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

  select id into v_preface_id from paper_prefaces
  where paper_id = v_version.paper_id order by version_number desc limit 1;

  insert into paper_drafts (
    paper_id, org_id,
    source_version_id, source_version_number,
    next_version_number,
    html_content, file_name, file_data, file_size,
    title, compound, notes, metadata,
    preface_id, created_by
  ) values (
    v_version.paper_id, v_version.org_id,
    v_version.id, v_version.version_number,
    v_next_ver,
    v_version.html_content, v_version.file_name, v_version.file_data, v_version.file_size,
    v_paper.title, v_paper.compound,
    'Restored from v' || v_version.version_number,
    v_version.metadata,
    v_preface_id, v_user_id
  )
  returning * into v_draft;

  return v_draft;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- COMMENT RECONCILIATION: "identify which paper section is affected" is
-- listed as its own AI responsibility in feature #6, distinct from
-- categorization/importance/action — the original comment's own
-- section_key (feature #4/#5) only says what section the PRACTITIONER
-- was looking at, not necessarily what the AI determines actually needs to
-- change (e.g. a comment on the Abstract might really require an
-- Introduction edit). ai-generate is updated alongside this migration to
-- populate it.
-- ─────────────────────────────────────────────────────────────
alter table comment_change_map
  add column if not exists ai_affected_section text;
