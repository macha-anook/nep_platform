-- ============================================================
-- NEP Platform — Practitioner Review Workflow
-- Migration: 014_practitioner_review_workflow
-- Phase 4 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Practitioner = the existing `doctor` role. A doctor account can both
-- collect clinical data (existing feature) and review papers (this
-- migration) — no new role, same cross-org invite-by-email pattern already
-- proven by study_invitations / migration 003.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- HELPER: current authenticated user's email
-- Small security-definer wrapper, same pattern as is_admin()/
-- nep_current_org_id() — used by every practitioner-facing policy below.
-- ─────────────────────────────────────────────────────────────
create or replace function nep_current_email() returns text
language sql security definer set search_path = public stable as $$
  select email from users where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- PAPER REVIEW INVITATIONS
-- Clone of the study_invitations token pattern (008_invite_tokens.sql),
-- scoped to a paper instead of a clinical study.
-- ─────────────────────────────────────────────────────────────
create table paper_review_invitations (
  id                  uuid primary key default uuid_generate_v4(),
  paper_id            uuid not null references papers(id) on delete cascade,
  org_id              uuid not null references organisations(id) on delete cascade,
  practitioner_email  text not null,
  practitioner_name   text,
  token               text unique,
  token_expires_at    timestamptz,
  invite_status       text not null default 'pending'
                        check (invite_status in ('pending','accepted','declined','expired')),
  invited_by_user_id  uuid references users(id) on delete set null,
  invited_at          timestamptz not null default now(),
  last_sent_at        timestamptz,
  unique(paper_id, practitioner_email)
);
create index idx_review_invites_paper on paper_review_invitations(paper_id);
create index idx_review_invites_token on paper_review_invitations(token) where token is not null;
create index idx_review_invites_email on paper_review_invitations(practitioner_email);

alter table paper_review_invitations enable row level security;
create policy "review_invites_org" on paper_review_invitations
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());
create policy "review_invites_practitioner_select" on paper_review_invitations
  for select using (lower(practitioner_email) = lower(nep_current_email()));
create policy "review_invites_practitioner_update" on paper_review_invitations
  for update using (lower(practitioner_email) = lower(nep_current_email()));

-- Pre-login token validation, same shape as validate_invite_token.
create or replace function validate_review_invite_token(p_paper_id uuid, p_token text)
returns table(valid boolean, invite_id uuid, practitioner_email text, paper_title text, expires_at timestamptz)
language sql security definer set search_path = public as $$
  select true, i.id, i.practitioner_email, p.title, i.token_expires_at
  from paper_review_invitations i join papers p on p.id = i.paper_id
  where i.paper_id = p_paper_id and i.token = p_token
    and i.token_expires_at > now() and i.invite_status in ('pending','accepted');
$$;
grant execute on function validate_review_invite_token to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- CROSS-ORG READ ACCESS: an invited practitioner needs to read the
-- paper/draft (and, if it later gets published, the version too) they were
-- invited to review — same cross-org pattern as an invited doctor already
-- reading a researcher's clinical_studies row (migration 003).
-- Additive policies only — existing org-scoped policies are untouched.
-- ─────────────────────────────────────────────────────────────
create policy "papers_practitioner_via_invite" on papers for select
  using (exists (
    select 1 from paper_review_invitations i
    where i.paper_id = papers.id and lower(i.practitioner_email) = lower(nep_current_email())
  ));

-- Practitioners review the DRAFT (feature #4: "review draft papers") — the
-- mutable, pre-publication content, not an already-published version.
create policy "paper_drafts_practitioner_via_invite" on paper_drafts for select
  using (exists (
    select 1 from paper_review_invitations i
    where i.paper_id = paper_drafts.paper_id and lower(i.practitioner_email) = lower(nep_current_email())
  ));

-- Kept for later phases (e.g. post-publication validation reuses the same
-- invite list against the final published version) — harmless now since
-- nothing reads it yet.
create policy "paper_versions_practitioner_via_invite" on paper_versions for select
  using (exists (
    select 1 from paper_review_invitations i
    where i.paper_id = paper_versions.paper_id and lower(i.practitioner_email) = lower(nep_current_email())
  ));

-- ─────────────────────────────────────────────────────────────
-- PAPER REVIEWS
-- One row per practitioner review pass on a specific DRAFT. paper_draft_id
-- is nullable with ON DELETE SET NULL because publishing a draft deletes it
-- (see publish_paper_draft) — the review record must survive that as a
-- standalone historical record, not disappear or block the publish.
-- `iteration` is a plain counter for now — real multi-cycle state
-- machinery is a later phase (Iterative Review Process); this column is
-- forward-compatible with it, not a working cycle system yet.
-- ─────────────────────────────────────────────────────────────
create table paper_reviews (
  id                uuid primary key default uuid_generate_v4(),
  paper_id          uuid not null references papers(id) on delete cascade,
  paper_draft_id    uuid references paper_drafts(id) on delete set null,
  org_id            uuid not null references organisations(id) on delete cascade,
  invitation_id     uuid references paper_review_invitations(id) on delete set null,
  reviewer_email    text not null,
  iteration         int not null default 1,
  overall_comments  text,
  recommendation    text check (recommendation in ('accept','minor_revisions','major_revisions','reject')),
  status            text not null default 'in_progress' check (status in ('in_progress','submitted')),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index idx_paper_reviews_paper on paper_reviews(paper_id);
create index idx_paper_reviews_reviewer on paper_reviews(reviewer_email);

alter table paper_reviews enable row level security;
create policy "paper_reviews_org_read" on paper_reviews
  for select using (org_id = nep_current_org_id());
create policy "paper_reviews_practitioner_all" on paper_reviews
  using (lower(reviewer_email) = lower(nep_current_email()))
  with check (lower(reviewer_email) = lower(nep_current_email()));

-- ─────────────────────────────────────────────────────────────
-- PAPER REVIEW COMMENTS
-- Section-level (or overall, when section_key is null) feedback. This is
-- also the core of the Feedback Repository (implementation_status) —
-- deliberately built here since it falls directly out of this schema
-- rather than needing a separate migration.
-- ─────────────────────────────────────────────────────────────
create table paper_review_comments (
  id                    uuid primary key default uuid_generate_v4(),
  review_id             uuid not null references paper_reviews(id) on delete cascade,
  paper_id              uuid not null references papers(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,
  section_key           text,
  quoted_text           text,
  comment_text          text not null,
  importance            text not null default 'medium' check (importance in ('low','medium','high','critical')),
  implementation_status text not null default 'pending'
                          check (implementation_status in ('pending','accepted','rejected','implemented')),
  created_at            timestamptz not null default now()
);
create index idx_review_comments_review on paper_review_comments(review_id);
create index idx_review_comments_paper on paper_review_comments(paper_id);

alter table paper_review_comments enable row level security;
-- Researcher: full read, and status-update only (never author/delete someone
-- else's comment) — enforced by only exposing an update path for
-- implementation_status client-side, not by a narrower column-level policy,
-- consistent with how the rest of this schema relies on the client's own
-- adapter methods rather than column-level grants.
create policy "review_comments_org_all" on paper_review_comments
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());
create policy "review_comments_practitioner_select" on paper_review_comments
  for select using (exists (
    select 1 from paper_reviews r where r.id = review_id and lower(r.reviewer_email) = lower(nep_current_email())
  ));
create policy "review_comments_practitioner_insert" on paper_review_comments
  for insert with check (exists (
    select 1 from paper_reviews r where r.id = review_id and lower(r.reviewer_email) = lower(nep_current_email())
  ));
