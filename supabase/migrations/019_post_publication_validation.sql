-- ============================================================
-- NEP Platform — Post-Publication Practitioner Validation
-- Migration: 019_post_publication_validation
-- Phase 10 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Reuses the same practitioners already invited to review a paper
-- (paper_review_invitations) and the same paper_versions_practitioner_via_invite
-- RLS policy from migration 014 for reading the final version — this table
-- only needs its own token (a validation invite can legitimately outlive
-- the original review invite's token) and its own feedback fields.
-- ============================================================

create table post_publication_validations (
  id                            uuid primary key default uuid_generate_v4(),
  paper_id                      uuid not null references papers(id) on delete cascade,
  final_version_id              uuid not null references paper_versions(id),
  org_id                        uuid not null references organisations(id) on delete cascade,
  practitioner_email            text not null,
  practitioner_name             text,
  token                         text unique,
  token_expires_at              timestamptz,
  finding_validation            text,
  practical_applicability       text,
  recommendations               text,
  future_research_suggestions   text,
  status                        text not null default 'invited' check (status in ('invited','submitted')),
  invited_at                    timestamptz not null default now(),
  submitted_at                  timestamptz,
  unique(paper_id, practitioner_email, final_version_id)
);
create index idx_ppv_paper on post_publication_validations(paper_id);
create index idx_ppv_token on post_publication_validations(token) where token is not null;
create index idx_ppv_email on post_publication_validations(practitioner_email);

alter table post_publication_validations enable row level security;
create policy "ppv_org_all" on post_publication_validations
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());
create policy "ppv_practitioner_select" on post_publication_validations
  for select using (lower(practitioner_email) = lower(nep_current_email()));
create policy "ppv_practitioner_update" on post_publication_validations
  for update using (lower(practitioner_email) = lower(nep_current_email()));

-- Pre-login token validation, keyed by (paper_id, token) — not the row id —
-- same reason send-review-invite builds its link from (paperId, token):
-- the token is generated before the row exists (it's written only after
-- the email confirms sent), so the link can't depend on a not-yet-created
-- primary key.
create or replace function validate_ppv_token(p_paper_id uuid, p_token text)
returns table(valid boolean, validation_id uuid, practitioner_email text, paper_title text, expires_at timestamptz)
language sql security definer set search_path = public as $$
  select true, v.id, v.practitioner_email, p.title, v.token_expires_at
  from post_publication_validations v join papers p on p.id = v.paper_id
  where v.paper_id = p_paper_id and v.token = p_token and v.token_expires_at > now();
$$;
grant execute on function validate_ppv_token to anon, authenticated;

-- Consolidated report (feature #10: "Consolidated practitioner validation
-- report") — a read-only view over data that's already fully captured
-- above, not a duplicate copy of it.
--
-- security_invoker is required here: without it, this view would run with
-- the migration's (superuser) privileges and silently bypass the RLS
-- policies on post_publication_validations, leaking every org's data to
-- any authenticated caller. With it, the view enforces the querying user's
-- own RLS exactly as if they'd queried the table directly.
create view post_publication_report
  with (security_invoker = true) as
  select paper_id,
         count(*)                                     as invited,
         count(*) filter (where status = 'submitted')  as responses,
         array_agg(practitioner_email)                 as practitioners
  from post_publication_validations
  group by paper_id;
