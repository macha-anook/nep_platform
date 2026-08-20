-- ============================================================
-- NEP Platform — AI Comment Reconciliation
-- Migration: 021_ai_comment_reconciliation
-- Phase 6 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- job_type='reconciliation' already existed in ai_jobs' CHECK constraint
-- since migration 013 — extended here (additively) with
-- 'reconciliation_apply', the SEPARATE second AI call that generates the
-- next draft from accepted feedback. Kept distinct from the analysis call
-- so the researcher reviews/decides on every recommendation before any
-- draft content actually changes.
-- ============================================================

alter table ai_jobs drop constraint if exists ai_jobs_job_type_check;
alter table ai_jobs add constraint ai_jobs_job_type_check
  check (job_type in ('draft_sections','preface','reconciliation','reconciliation_apply'));

-- ─────────────────────────────────────────────────────────────
-- COMMENT RECONCILIATIONS
-- One row per "analyze feedback" pass over a closed review cycle's
-- comments. `summary` is a lightweight rollup (counts) for display — the
-- actual per-comment analysis lives in comment_change_map below, not here,
-- so nothing queryable is buried in a blob.
-- ─────────────────────────────────────────────────────────────
create table comment_reconciliations (
  id               uuid primary key default uuid_generate_v4(),
  paper_id         uuid not null references papers(id) on delete cascade,
  org_id           uuid not null references organisations(id) on delete cascade,
  review_cycle_id  uuid references paper_review_cycles(id) on delete set null,
  ai_job_id        uuid references ai_jobs(id) on delete set null,
  summary          jsonb not null default '{}',  -- {duplicate_count, conflicting_count, actionable_count, out_of_scope_count}
  applied_draft_id uuid references paper_drafts(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index idx_reconciliations_paper on comment_reconciliations(paper_id);

alter table comment_reconciliations enable row level security;
create policy "reconciliations_org_all" on comment_reconciliations
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());

-- ─────────────────────────────────────────────────────────────
-- COMMENT CHANGE MAP
-- One row per comment per reconciliation pass — every requirement bullet
-- gets its own explicit, queryable column rather than a jsonb blob:
--   "identify duplicate feedback"       → ai_category + duplicate_of_comment_id
--   "identify conflicting suggestions"  → ai_category + conflicts_with_comment_id
--   "categorize feedback importance"    → ai_importance (the AI's OWN read,
--                                          distinct from paper_review_comments
--                                          .importance, which is the
--                                          practitioner's self-rating —
--                                          both are kept, neither overwrites
--                                          the other)
--   "recommend implementation actions"  → ai_recommended_action (structured)
--                                          + ai_recommendation (free-text why)
-- Full traceability chain:
--   original comment (comment_id) ↔ AI recommendation (ai_* columns) ↔
--   researcher decision (researcher_decision/decided_by/decided_at) ↔
--   implemented change (implemented_in_draft_id)
-- ─────────────────────────────────────────────────────────────
create table comment_change_map (
  id                        uuid primary key default uuid_generate_v4(),
  reconciliation_id         uuid not null references comment_reconciliations(id) on delete cascade,
  comment_id                uuid not null references paper_review_comments(id) on delete cascade,
  org_id                    uuid not null references organisations(id) on delete cascade,

  ai_category               text not null default 'actionable'
                              check (ai_category in ('duplicate','conflicting','actionable','out_of_scope')),
  duplicate_of_comment_id   uuid references paper_review_comments(id) on delete set null,
  conflicts_with_comment_id uuid references paper_review_comments(id) on delete set null,
  ai_importance             text check (ai_importance in ('low','medium','high','critical')),
  ai_recommended_action     text check (ai_recommended_action in ('implement','partially_implement','discuss','decline')),
  ai_recommendation         text,

  researcher_decision       text check (researcher_decision in ('accepted','rejected','deferred')),
  implemented_in_draft_id   uuid references paper_drafts(id) on delete set null,
  decided_by                uuid references users(id) on delete set null,
  decided_at                timestamptz,

  unique(reconciliation_id, comment_id)
);
create index idx_change_map_reconciliation on comment_change_map(reconciliation_id);
create index idx_change_map_comment on comment_change_map(comment_id);

alter table comment_change_map enable row level security;
create policy "change_map_org_all" on comment_change_map
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: decide_on_recommendation(map_id, decision)
--   Records the researcher's accept/reject/defer decision with who/when —
--   the "researcher decision" link in the traceability chain.
-- ─────────────────────────────────────────────────────────────
create or replace function decide_on_recommendation(p_map_id uuid, p_decision text)
returns comment_change_map
language plpgsql security definer set search_path = public as $$
declare
  v_row comment_change_map;
begin
  if p_decision not in ('accepted','rejected','deferred') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select * into v_row from comment_change_map where id = p_map_id;
  if not found then
    raise exception 'Change map row % not found', p_map_id;
  end if;
  if v_row.org_id <> nep_current_org_id() then
    raise exception 'Not authorized to decide on this recommendation';
  end if;

  update comment_change_map
    set researcher_decision = p_decision, decided_by = auth.uid(), decided_at = now()
    where id = p_map_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function decide_on_recommendation to authenticated;
