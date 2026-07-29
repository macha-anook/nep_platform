-- ============================================================
-- NEP Platform — Patient Feedback Reports + Reference Papers
-- Migration: 012_feedback_reports_and_reference_papers
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- (Run after 011_new_users_no_default_role.sql)
--
-- Platform-wide tables (no org_id / tenant isolation) — deliberate,
-- see plan notes: practitioners get their own org at signup and
-- these tables aren't tied to any study/org, so "average rating for
-- a medicine across all patients" and "papers visible to every
-- practitioner" only make sense pooled across all orgs.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PATIENT FEEDBACK REPORTS
-- One row per practitioner-submitted report. patient_id is
-- auto-generated (patient_<n>) from a global sequence.
-- ─────────────────────────────────────────────────────────────
create table patient_feedback_reports (
  id            uuid primary key default uuid_generate_v4(),
  created_by    uuid not null references users(id),
  seq_no        bigserial,
  patient_id    text generated always as ('patient_' || seq_no) stored,
  complaints    text,
  medicine      text not null,
  feedback_6mo  text,
  rating        smallint not null check (rating between 1 and 10),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table patient_feedback_reports enable row level security;

-- Practitioners manage only their own reports. No policy exists for
-- researchers, so RLS denies them by default — the aggregate function
-- below is the only sanctioned read path for that role.
create policy "feedback_reports_own_practitioner" on patient_feedback_reports
  for all
  using (
    created_by = auth.uid()
    and (select role from users where id = auth.uid()) = 'doctor'
  )
  with check (
    created_by = auth.uid()
    and (select role from users where id = auth.uid()) = 'doctor'
  );

-- Pre-aggregated, no patient-level columns — safe to expose to researchers.
create function get_medicine_effectiveness()
returns table(medicine text, avg_rating numeric, report_count bigint)
language sql
security definer
set search_path = public
as $$
  select medicine, round(avg(rating)::numeric, 2), count(*)
  from patient_feedback_reports
  group by medicine
  order by medicine
$$;

grant execute on function get_medicine_effectiveness() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- REFERENCE PAPERS
-- Uploaded by researchers; viewable/downloadable by everyone.
-- ─────────────────────────────────────────────────────────────
create table reference_papers (
  id          uuid primary key default uuid_generate_v4(),
  uploaded_by uuid not null references users(id),
  title       text not null,
  file_name   text not null,
  file_size   integer,
  file_type   text,
  file_data   text not null,   -- base64 data URL, same convention as PapersPanel's fileData
  created_at  timestamptz not null default now()
);

alter table reference_papers enable row level security;

create policy "reference_papers_select_all" on reference_papers
  for select using (true);

create policy "reference_papers_researcher_write" on reference_papers
  for all
  using ((select role from users where id = auth.uid()) = 'researcher')
  with check (
    uploaded_by = auth.uid()
    and (select role from users where id = auth.uid()) = 'researcher'
  );
