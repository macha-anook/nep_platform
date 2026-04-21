-- ============================================================
-- NEP Platform — Sprint 2 Doctor Flow Tables
-- Migration: 002_doctor_flow
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- (Run after 001_initial_schema.sql)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- CLINICAL STUDIES
-- Created by researchers; doctors are invited via study_invitations
-- ─────────────────────────────────────────────────────────────
create table clinical_studies (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organisations(id) on delete cascade,
  created_by          uuid not null references users(id),
  title               text not null,
  description         text,
  compound            jsonb,            -- {name, scientific, extract_form, dose_range, ...}
  target_sample_size  integer not null default 50,
  duration            text not null default '12 weeks',
  status              text not null default 'recruiting',  -- recruiting|collecting|analysis|draft|published
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- STUDY INVITATIONS
-- One row per doctor per study
-- ─────────────────────────────────────────────────────────────
create table study_invitations (
  id              uuid primary key default uuid_generate_v4(),
  study_id        uuid not null references clinical_studies(id) on delete cascade,
  org_id          uuid not null references organisations(id) on delete cascade,
  doctor_email    text not null,
  doctor_name     text,
  authenticated   boolean not null default false,
  committed       boolean not null default false,
  committed_at    timestamptz,
  invited_at      timestamptz not null default now(),
  unique(study_id, doctor_email)
);

-- ─────────────────────────────────────────────────────────────
-- DOCTOR PATIENTS
-- One row per patient enrolled by a doctor in a study
-- ─────────────────────────────────────────────────────────────
create table doctor_patients (
  id                    uuid primary key default uuid_generate_v4(),
  study_id              uuid not null references clinical_studies(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,
  doctor_id             uuid not null references users(id),

  patient_id            text not null,   -- MRN / clinic ID
  age                   integer,
  gender                text,
  symptom1              text,
  symptom2              text,
  baseline_score1       numeric,
  baseline_score2       numeric,
  study_type            text,
  quality_score         integer,

  -- Primary prescription
  primary_compound      jsonb,
  primary_dose          text,
  primary_dose_unit     text default 'mg',
  primary_frequency     text,
  primary_form          text,

  -- Secondary prescription (optional)
  secondary_compound    jsonb,
  secondary_dose        text,
  secondary_dose_unit   text,
  secondary_frequency   text,

  target_duration       text,
  doctor_name           text,
  doctor_clinic         text,
  doctor_reg_number     text,
  status                text not null default 'active',  -- active | complete
  outcome               jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- PATIENT WEEKLY LOGS
-- One row per week per patient
-- ─────────────────────────────────────────────────────────────
create table patient_weekly_logs (
  id                    uuid primary key default uuid_generate_v4(),
  patient_id            uuid not null references doctor_patients(id) on delete cascade,
  week                  integer not null,   -- 0 = baseline
  log_date              date,
  response              text,
  score1                numeric,
  score2                numeric,
  side_effects          jsonb default '[]',
  side_effect_severity  text,
  dose_adjusted         boolean default false,
  new_dose              text,
  notes                 text,
  created_at            timestamptz not null default now(),
  unique(patient_id, week)
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
create index idx_clinical_studies_org      on clinical_studies(org_id);
create index idx_study_invitations_study   on study_invitations(study_id);
create index idx_study_invitations_email   on study_invitations(doctor_email);
create index idx_doctor_patients_study     on doctor_patients(study_id);
create index idx_doctor_patients_doctor    on doctor_patients(doctor_id);
create index idx_weekly_logs_patient       on patient_weekly_logs(patient_id);

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────
create trigger trg_clinical_studies_updated
  before update on clinical_studies
  for each row execute function update_updated_at();

create trigger trg_doctor_patients_updated
  before update on doctor_patients
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table clinical_studies enable row level security;
create policy "studies_own_org" on clinical_studies
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

alter table study_invitations enable row level security;
create policy "invitations_own_org" on study_invitations
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

alter table doctor_patients enable row level security;
create policy "patients_own_org" on doctor_patients
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

alter table patient_weekly_logs enable row level security;
create policy "logs_via_patient" on patient_weekly_logs
  using (
    patient_id in (
      select id from doctor_patients where org_id = auth_org_id()
    )
  );
