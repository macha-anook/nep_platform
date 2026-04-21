-- ============================================================
-- NEP Platform — Supabase Database Schema
-- Migration: 001_initial_schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- ORGANISATIONS
-- Every resource is scoped to an org. Users belong to one org.
-- ─────────────────────────────────────────────────────────────
create table organisations (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null,
  slug                    text unique not null,
  plan                    text not null default 'starter',  -- starter | pro | enterprise
  stripe_customer_id      text,
  generation_quota_monthly int not null default 3,
  generation_used          int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- USERS (extends Supabase Auth)
-- ─────────────────────────────────────────────────────────────
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references organisations(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'researcher',  -- doctor | researcher
  orcid       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────────────────────
create table projects (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organisations(id) on delete cascade,
  created_by          uuid not null references users(id),
  name                text not null,
  compound_id         text,
  target_journal      text,
  paper_title         text,
  keywords            text,
  researcher          text,
  affiliation         text,
  co_authors          text,
  research_team       jsonb not null default '[]'::jsonb,
  framework_version   text not null default '5.0',
  status              text not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- COMPOUNDS
-- One row per compound per project
-- ─────────────────────────────────────────────────────────────
create table compounds (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,
  compound_id           text,
  compound_name         text,
  scientific_name       text,
  extract_form          text,
  standardisation       text,
  dose_range            text,
  duration_range        text,
  class                 text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(project_id)   -- one compound per project
);

-- ─────────────────────────────────────────────────────────────
-- STUDY OUTCOMES
-- Core data table — one row per outcome per study
-- ─────────────────────────────────────────────────────────────
create table study_outcomes (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,

  -- Study identity
  study_id              text,
  study_ref_id          text,
  compound_id           text,
  compound_name         text,
  scientific_name       text,
  study_type            text,  -- RCT | Meta | Observational | Mechanistic

  -- Population
  population            text,

  -- Outcome identity
  outcome_name          text,
  outcome_category      text,
  direction             text,  -- Improved | No Change | Worsened
  significance          text,  -- Significant | Not Significant | Not Reported

  -- Result magnitude
  sample_n              integer,
  es_value              numeric,
  es_type               text,  -- MD | SMD | RR | OR | HR | WMD
  ci_lower              numeric,
  ci_upper              numeric,
  p_value               text,
  i2                    numeric,

  -- Scoring inputs
  quality_score         integer,  -- Q: 1–5
  outcome_score         integer,  -- O: 1–5
  bias_d1               numeric,  -- 0 | 0.5 | 1
  bias_d2               numeric,
  bias_d3               numeric,
  bias_d4               numeric,
  bias_d5               numeric,
  bias_tool             text,     -- RoB 2 | ROBINS-I | AMSTAR 2 | NOS | None
  mcid_met              text,     -- Yes | No | Unknown

  -- Computed (stored for querying; recomputed on read)
  sample_score          integer,  -- S: auto from sample_n
  bias_penalty          numeric,  -- auto: sum(D1..D5)
  weighted_score        numeric,  -- WS = Q + S + O - B

  sort_order            integer default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- REFERENCES
-- One row per source publication
-- ─────────────────────────────────────────────────────────────
create table study_references (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references projects(id) on delete cascade,
  org_id              uuid not null references organisations(id) on delete cascade,
  ref_id              text,
  study_ref_id        text,
  compound_id         text,
  title               text,
  authors             text,
  year                text,
  journal             text,
  volume              text,
  issue               text,
  pages               text,
  doi                 text,
  bias_tool           text,
  bias_overall        text,
  sort_order          integer default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- MCID REFERENCES
-- Per-project MCID thresholds (seeded from global library)
-- ─────────────────────────────────────────────────────────────
create table mcid_references (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid references projects(id) on delete cascade,  -- null = global default
  org_id              uuid references organisations(id) on delete cascade,
  outcome_measure     text not null,
  scale_unit          text,
  mcid_value          numeric not null,
  unit                text,
  published_reference text,
  compounds_guidance  text,
  is_global           boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- GENERATED PAPERS
-- One row per generation job result
-- ─────────────────────────────────────────────────────────────
create table generated_papers (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  org_id          uuid not null references organisations(id) on delete cascade,
  generated_by    uuid not null references users(id),
  status          text not null default 'pending',  -- pending | running | done | error
  stage           integer default 1,
  pct             integer default 0,
  log             jsonb default '[]',
  word_count      integer,
  veracity_score  text,
  tables_count    integer,
  docx_path       text,   -- S3 key
  pdf_path        text,   -- S3 key
  error_message   text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
create index idx_projects_org       on projects(org_id);
create index idx_outcomes_project   on study_outcomes(project_id);
create index idx_outcomes_org       on study_outcomes(org_id);
create index idx_refs_project       on study_references(project_id);
create index idx_papers_project     on generated_papers(project_id);
create index idx_users_org          on users(org_id);

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_projects_updated   before update on projects   for each row execute function update_updated_at();
create trigger trg_outcomes_updated   before update on study_outcomes for each row execute function update_updated_at();
create trigger trg_compounds_updated  before update on compounds   for each row execute function update_updated_at();
create trigger trg_refs_updated       before update on study_references for each row execute function update_updated_at();
create trigger trg_users_updated      before update on users       for each row execute function update_updated_at();
create trigger trg_orgs_updated       before update on organisations for each row execute function update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Every table locked to org_id from the JWT claim
-- ─────────────────────────────────────────────────────────────

-- Helper: get org_id for the current authenticated user
create or replace function auth_org_id() returns uuid language sql stable as $$
  select org_id from users where id = auth.uid();
$$;

-- Organisations: users see only their own org
alter table organisations enable row level security;
create policy "org_own" on organisations
  using (id = auth_org_id());

-- Users: see only own org's users
alter table users enable row level security;
create policy "users_own_org" on users
  using (org_id = auth_org_id());

-- Projects
alter table projects enable row level security;
create policy "projects_own_org" on projects
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Compounds
alter table compounds enable row level security;
create policy "compounds_own_org" on compounds
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Study outcomes
alter table study_outcomes enable row level security;
create policy "outcomes_own_org" on study_outcomes
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Study references
alter table study_references enable row level security;
create policy "refs_own_org" on study_references
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- MCID references (global = visible to all; project-scoped = own org only)
alter table mcid_references enable row level security;
create policy "mcid_global_or_own" on mcid_references
  using (is_global = true or org_id = auth_org_id());

-- Generated papers
alter table generated_papers enable row level security;
create policy "papers_own_org" on generated_papers
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- ─────────────────────────────────────────────────────────────
-- SEED: GLOBAL MCID LIBRARY
-- ─────────────────────────────────────────────────────────────
insert into mcid_references (outcome_measure, scale_unit, mcid_value, unit, published_reference, compounds_guidance, is_global) values
  ('Perceived Stress Scale (PSS)',           'PSS (0–40)',         4.0,  'points',  'Cohen et al. 1983; Smeets et al. 2007',        'Ashwagandha, adaptogens',               true),
  ('Hamilton Anxiety Rating Scale (HAM-A)',  'HAM-A (0–56)',       7.0,  'points',  'Shear et al. 2001',                            'Ashwagandha, anxiety interventions',    true),
  ('C-Reactive Protein (CRP)',               'mg/L',               1.0,  'mg/L',    'Emerging consensus; Ridker 2003',              'Curcumin, anti-inflammatory',           true),
  ('Pain — Visual Analogue Scale (VAS)',     'VAS (0–100 mm)',     15.0, 'mm',      'Farrar et al. 2001',                           'Curcumin, joint pain',                  true),
  ('Body Mass Index (BMI)',                  'kg/m²',              1.0,  'kg/m²',   'Clinical consensus',                           'Ashwagandha, curcumin — metabolic',     true),
  ('HbA1c',                                  '% (NGSP/IFCC)',      0.5,  '%',       'ADA Standards of Care 2022',                   'Probiotics, glycaemic interventions',   true),
  ('Fasting Blood Glucose',                  'mmol/L',             0.4,  'mmol/L',  'Clinical consensus',                           'Probiotics, glycaemic interventions',   true),
  ('Serum Cortisol',                         'nmol/L',            20.0,  'nmol/L',  'Clinical consensus',                           'Ashwagandha stress studies',            true),
  ('Sleep Onset Latency',                    'minutes',           10.0,  'min',     'Morin et al. 2009',                            'Ashwagandha, sleep studies',            true),
  ('Pittsburgh Sleep Quality Index (PSQI)',  'PSQI total (0–21)',   2.5,  'points',  'Mollayeva et al. Sleep Med Rev. 2016',         'Ashwagandha, sleep studies',            true),
  ('Total Cholesterol',                      'mmol/L',             0.3,  'mmol/L',  'Clinical consensus',                           'Curcumin, probiotics — lipid',          true),
  ('LDL Cholesterol',                        'mmol/L',             0.2,  'mmol/L',  'Clinical consensus',                           'Curcumin, omega-3 — lipid',             true),
  ('Triglycerides',                          'mmol/L',             0.3,  'mmol/L',  'Clinical consensus',                           'Curcumin, omega-3 — lipid',             true),
  ('HOMA-IR',                                'ratio',              0.5,  'units',   'Clinical consensus',                           'Probiotics, berberine — insulin',       true),
  ('6-Minute Walk Test',                     'metres',            25.0,  'm',       'Bohannon & Crouch 2017',                       'Cardiovascular / mobility studies',     true),
  ('SF-36 Physical Function',                'score (0–100)',       5.0,  'points',  'Wyrwich et al. 1999',                          'Broad clinical interventions',          true),
  ('SF-36 Mental Component Summary (MCS)',   'score (0–100)',       4.0,  'points',  'Wyrwich et al. J Clin Epidemiol. 2004',        'Ashwagandha, general wellbeing',        true),
  ('HAM-A / PSS — SMD threshold',           'SMD (Cohen d)',       0.5,  'SMD',     'Cohen 1988 (medium effect ≥0.5)',              'Meta-analyses — use when raw MD unavailable', true);

-- ─────────────────────────────────────────────────────────────
-- AUTO-PROVISION: create org + user row after auth.users insert
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  new_org_id uuid;
begin
  -- Create a new org for this user
  insert into organisations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace',
    lower(replace(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), ' ', '-'))
      || '-' || substr(new.id::text, 1, 8)
  )
  returning id into new_org_id;

  -- Create user row linked to auth.users
  insert into users (id, org_id, email, full_name, role)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
