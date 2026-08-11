-- ============================================================
-- NEP Platform — Iterative Review Process
-- Migration: 018_iterative_review
-- Phase 9 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Formalizes the paper_review_cycles concept deferred in migration 014.
-- Stage enum omits 'reconciliation_done' for now — AI Comment Reconciliation
-- (feature #6) isn't built yet; this CHECK constraint can be extended
-- additively (drop/re-add) once it lands, without touching existing rows.
-- ============================================================

create table paper_review_cycles (
  id            uuid primary key default uuid_generate_v4(),
  paper_id      uuid not null references papers(id) on delete cascade,
  org_id        uuid not null references organisations(id) on delete cascade,
  cycle_number  int not null,
  stage         text not null default 'review_open'
                  check (stage in ('review_open','review_closed','published')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  published_at  timestamptz,
  unique(paper_id, cycle_number)
);
create index idx_review_cycles_paper on paper_review_cycles(paper_id);

alter table paper_review_cycles enable row level security;
create policy "review_cycles_org_all" on paper_review_cycles
  using (org_id = nep_current_org_id()) with check (org_id = nep_current_org_id());

-- startPaperReview() (called by the practitioner, not an org member) needs
-- to read the paper's current cycle to stamp it onto their review row —
-- same invite-match pattern as papers_practitioner_via_invite.
create policy "review_cycles_practitioner_select" on paper_review_cycles
  for select using (exists (
    select 1 from paper_review_invitations i
    where i.paper_id = paper_review_cycles.paper_id and lower(i.practitioner_email) = lower(nep_current_email())
  ));

alter table paper_reviews
  add column if not exists review_cycle_id uuid references paper_review_cycles(id) on delete set null;

-- Backfill: every paper that already has reviews (from Phase 4/5, before
-- cycles existed) gets a single retroactive cycle 1 so its history isn't
-- orphaned — reviews already submitted stay attributed correctly.
insert into paper_review_cycles (paper_id, org_id, cycle_number, stage, opened_at)
select distinct r.paper_id, r.org_id, 1, 'review_open', min(r.created_at) over (partition by r.paper_id)
from paper_reviews r
where r.review_cycle_id is null
on conflict (paper_id, cycle_number) do nothing;

update paper_reviews r
  set review_cycle_id = c.id
  from paper_review_cycles c
  where r.paper_id = c.paper_id and c.cycle_number = 1 and r.review_cycle_id is null;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: ensure_open_review_cycle(paper_id)
--   Returns the paper's currently-open cycle, or opens a new one (next
--   cycle_number) if the latest cycle is closed/published or none exists.
--   Called by inviteReviewer() so cycle bookkeeping is transparent to the
--   researcher — inviting a reviewer just works, cycle 1/2/3… advances
--   automatically as review→revise→publish repeats.
-- ─────────────────────────────────────────────────────────────
create or replace function ensure_open_review_cycle(p_paper_id uuid)
returns paper_review_cycles
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_latest paper_review_cycles;
  v_new    paper_review_cycles;
begin
  select * into v_latest from paper_review_cycles
    where paper_id = p_paper_id order by cycle_number desc limit 1;

  if found and v_latest.stage = 'review_open' then
    return v_latest;
  end if;

  select org_id into v_org_id from papers where id = p_paper_id;
  if v_org_id is null then
    raise exception 'Paper % not found', p_paper_id;
  end if;

  insert into paper_review_cycles (paper_id, org_id, cycle_number, stage)
  values (p_paper_id, v_org_id, coalesce(v_latest.cycle_number, 0) + 1, 'review_open')
  returning * into v_new;

  return v_new;
end;
$$;
grant execute on function ensure_open_review_cycle to authenticated;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: close_review_cycle(cycle_id)
--   Explicit researcher action: "I'm done collecting feedback for this
--   round, moving to revise."
-- ─────────────────────────────────────────────────────────────
create or replace function close_review_cycle(p_cycle_id uuid)
returns paper_review_cycles
language plpgsql security definer set search_path = public as $$
declare
  v_cycle paper_review_cycles;
begin
  select * into v_cycle from paper_review_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Review cycle % not found', p_cycle_id;
  end if;
  if v_cycle.org_id <> nep_current_org_id() then
    raise exception 'Not authorized to close this review cycle';
  end if;

  update paper_review_cycles
    set stage = 'review_closed', closed_at = now()
    where id = p_cycle_id
    returning * into v_cycle;

  return v_cycle;
end;
$$;
grant execute on function close_review_cycle to authenticated;

-- ─────────────────────────────────────────────────────────────
-- FUNCTION: advance_review_cycle_on_publish(paper_id)
--   Called right after publish_paper_draft succeeds — if the paper's latest
--   cycle is 'review_closed', marks it 'published' ("New Draft Version" /
--   "Publication" steps of the iterative review workflow). A no-op if the
--   paper has no cycle yet (nothing was ever sent for review) or the latest
--   cycle is still open — publishing mid-review doesn't silently close it.
-- ─────────────────────────────────────────────────────────────
create or replace function advance_review_cycle_on_publish(p_paper_id uuid)
returns paper_review_cycles
language plpgsql security definer set search_path = public as $$
declare
  v_cycle paper_review_cycles;
begin
  select * into v_cycle from paper_review_cycles
    where paper_id = p_paper_id order by cycle_number desc limit 1;

  if not found or v_cycle.stage <> 'review_closed' then
    return v_cycle;
  end if;

  update paper_review_cycles
    set stage = 'published', published_at = now()
    where id = v_cycle.id
    returning * into v_cycle;

  return v_cycle;
end;
$$;
grant execute on function advance_review_cycle_on_publish to authenticated;
