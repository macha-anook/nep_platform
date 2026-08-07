# AI Research Collaboration Platform — Solution Design

Status: **design only — no implementation started**
Scope: the 10 feature enhancements requested (researcher registration/approval, AI draft
generation, AI preface generation, practitioner review, feedback repository, AI comment
reconciliation, version management, practitioner notifications, iterative review, post‑publication
validation).

---

## 0. Reality check — CLAUDE.md is stale, read this before anything else

CLAUDE.md describes Sprint 1 as "everything runs on a MockAdapter — no real backend yet" and Sprint
2 as future work. That is no longer true. As of `development` (`ee8beab`):

- `App.jsx:10979` — `const API = SupabaseAdapter`. The app has been running live on Supabase for
  several merged commits, not MockAdapter.
- Auth is real: Google OAuth + email OTP, both live (`src/adapters/supabase.js`).
- There is already a full **invitation system**: `clinical_studies` / `study_invitations` (with
  crypto-random tokens, 7‑day expiry, `security definer` RPC `validate_invite_token` callable
  pre‑login) / `doctor_patients` / `patient_weekly_logs`, used to invite doctors into a
  researcher's clinical study and have them log data.
- There is already a full **paper version-control system**: `papers` / `paper_versions` /
  `paper_drafts`, with atomic, lock-protected `security definer` RPCs `publish_paper_draft` and
  `create_paper_revision`. Versions are immutable once published (no UPDATE/INSERT RLS policy on
  `paper_versions` — only the RPCs can write them).
- There is already a **transactional email pipeline**: Supabase Edge Function `send-doctor-invite`
  sends styled HTML mail via Resend, using a service-role client, with a reusable dark-theme
  template (header, info-cards, CTA button, expiry notice, plain-link fallback, footer).
- There is already a **working Anthropic Claude integration**, just disconnected: `api/claude.js`
  (Vercel serverless function) proxies `POST https://api.anthropic.com/v1/messages` with
  `ANTHROPIC_API_KEY`, model `claude-sonnet-4-20250514`. Both client call sites
  (`callClaude`/keyword suggestions, `expandNarrative`/AI discussion expansion) are hard-disabled
  (`_skipApi = true`, plus a dead `ReferenceError` bug in `callClaude`) and always fall back to
  templated text.
- There is **no admin role, no admin portal, no approval gate, no comment/review/annotation UI, no
  multi-seat org** anywhere today. Every signup silently provisions its own 1‑user "org." Those
  parts of this brief genuinely are greenfield.

Practical consequence: **this is materially less net-new work than the brief implies.** Feature #7
(version management) is ~80% done. The practitioner-invite plumbing for feature #4 is a near-exact
template match for `study_invitations`. The email templating for feature #8 is a clone job. The AI
plumbing for #2/#3/#6 is "reconnect and prompt-engineer a proxy that already works," not "integrate
an LLM from scratch." The genuinely new surface is: admin/approval, comments/feedback, AI
reconciliation logic, and post-publication validation.

One latent bug worth fixing as part of this work regardless: `send-doctor-invite` builds the invite
link as `${platformUrl}?token=${token}` (no `?study=`), but the frontend's doctor-routing check
(`isDoctorUrl`) only fires on `?study=`. A doctor clicking the real emailed link today does not
correctly land in the doctor flow via that param — worth confirming/fixing before cloning this
pattern for review and validation invites.

This document assumes — per your answers — that Supabase is the system of record (already true),
Anthropic Claude is the AI provider, and Supabase Edge Functions + Resend handle email.

---

## 1. Requirements Analysis

### 1.1 Reusable modules (do not rebuild these)

| Capability needed | Existing asset | Reuse strategy |
|---|---|---|
| Token-based secure invite access | `study_invitations` (token, token_expires_at, invite_status) + `validate_invite_token` RPC | Clone the pattern into a new `paper_review_invitations` table + `validate_review_invite_token` RPC. Same shape, same security model. |
| Invite email delivery | `send-doctor-invite` Edge Function + Resend + HTML template | Clone into `send-review-invite` and `send-validation-invite` Edge Functions; extract the shared HTML shell into `_shared/email-template.ts` instead of copy-pasting inline strings three times. |
| Immutable version history | `papers` / `paper_versions` / `paper_drafts` + `publish_paper_draft` / `create_paper_revision` RPCs | Feature #7 is built. Extend, don't replace: add a `source` column (`manual` \| `ai_draft` \| `reconciliation`) and a nullable FK to the review cycle that produced it. |
| Async job + progress polling | `generated_papers` (status/stage/pct/log) + `startGeneration`/`pollJob` adapter contract | Reuse the exact contract shape for AI draft generation, preface generation, and reconciliation — same polling UX, same adapter pattern, one new generic `ai_jobs` table instead of three bespoke ones. |
| AI provider call | `api/claude.js` (Vercel) → Anthropic Messages API | Port the call into a new Supabase Edge Function `ai-generate` (see §3.3 for why) rather than the Vercel function, so it can share the service-role DB client the way `send-doctor-invite` does. Re-enable `expandNarrative`/`callClaude` as thin wrappers around it instead of leaving them dead. |
| Org/tenant isolation | `org_id` + RLS `using(org_id = auth_org_id())` on every table | Every new table follows the same pattern. No new isolation mechanism needed. |
| Cross-org access for an invited outsider | `study_invitations` RLS policies matching `auth.uid()`'s email (migration 003) | Same technique for practitioners reading a paper they're invited to review, and for post-publication validators. |
| Role-gated UI split | `user.role === 'doctor' ? <DoctorApp/> : <researcher UI>` | Add a third branch for `role === 'admin'` → `<AdminApp/>`. Practitioners reviewing papers still use the `doctor` role — no new role needed for that (see §6). |

### 1.2 Impacted components

- `src/App.jsx` (single file, per CLAUDE.md — stays that way this phase): new top-level branches for
  `AdminApp`, new tab(s) inside the researcher UI for Feedback/Review/Reconciliation, extensions to
  `PapersPanel` for review status and version provenance.
- `src/adapters/supabase.js` **and** `src/adapters/mock.js`: every new capability is a new adapter
  method, added to both per the existing "adding a method requires updating ALL adapters" rule in
  CLAUDE.md.
- `supabase/migrations/`: one new migration per logical table group (see §4), never editing a
  migration that's already shipped.
- `supabase/functions/`: `ai-generate`, `send-review-invite`, `send-review-submitted-notification`,
  `send-validation-invite`, `send-validation-submitted-notification`, plus a shared email template
  module.
- `api/claude.js`: superseded by the new Edge Function; leave in place until the new path is proven,
  then remove (not part of this phase's scope to delete — flag in ISSUES.md instead).

### 1.3 Assumptions

- The Supabase project already backing the live app is the same one this work targets (single
  environment; no staging/prod split visible in the repo — `vercel.json`/`.env.example` should be
  checked before running migrations against anything that isn't a scratch/dev project).
- "Practitioner" in the brief = the existing `doctor` role. Nothing in the brief distinguishes a
  paper-reviewing practitioner from a clinical-data-collecting doctor as a different person; both are
  external, invited-per-engagement, non-org-member users.
- Anthropic Claude via a server-side proxy (never client-side, to keep `ANTHROPIC_API_KEY` off the
  browser) — consistent with the existing (if dormant) `api/claude.js` design intent.
- "Registration & approval" is additive to, not a replacement for, the existing self-serve OTP/Google
  signup — see §3.5 for how the gate is layered on without breaking doctors or existing researchers.

### 1.4 Dependencies

- Resend account + `RESEND_API_KEY`/`EMAIL_FROM` secrets (already configured for
  `send-doctor-invite` — reused, not new).
- `ANTHROPIC_API_KEY` needs to be added as a **Supabase Edge Function secret** (it currently only
  exists as a Vercel env var for `api/claude.js`).
- No new third-party dependency required — everything routes through Supabase Postgres, Supabase
  Edge Functions (Deno), and Resend, matching the current stack exactly.

### 1.5 Risks / constraints

- **Live data risk**: because the app is already in real use on Supabase (not a clean Sprint-2
  cutover), every migration in this plan must be additive (`create table`, `alter table ... add
  column if not exists`) and every RLS change must be reviewed against existing policies — this is
  production schema work, not greenfield setup, regardless of what CLAUDE.md implies.
- **Registration approval replaces self-serve signup (confirmed, §6)**: today anyone can OTP/Google
  sign in and immediately pick `researcher` and get full access. Because the app is already live,
  this gate must not retroactively lock out **existing** researcher accounts that got in under the
  old self-serve model — **decided: auto-grandfather** every existing `users.role='researcher'` row
  as an approved registration (see §3.1 migration). Only signups from this point forward go through
  the approval queue.
- **AI cost/quota**: `organisations.generation_quota_monthly`/`generation_used` already exists for
  the legacy paper-generation flow — decide whether AI draft/preface/reconciliation calls consume
  the same quota or need their own counter before wiring billing-adjacent behavior.
- **`App.jsx` is already ~14,200 lines.** CLAUDE.md's "keep it a single file" rule was written when
  it was ~2,300. Continuing to bolt 10 more feature areas onto one file is a real maintainability
  risk — flagged, but per CLAUDE.md's explicit instruction not to restructure without being asked,
  this design does **not** propose splitting it. Worth raising with you directly once Phase 1 lands.

### 1.6 Recommended phase order

Reordered from the brief's list to respect actual dependencies (you can't review a draft that
doesn't exist yet; you can't reconcile comments that don't exist yet):

1. **`feature/nep-admin-and-registration`** — admin role + researcher registration/approval (blocks
   nothing else technically, but is the one with the open product question in §1.5 — resolve that
   first or de-risk by building it fully feature-flagged off).
2. **`feature/nep-ai-draft-generation`** — reconnect Claude via the new Edge Function; lowest-risk
   place to prove the AI plumbing since it has no review-cycle dependencies yet.
3. **`feature/nep-ai-preface-summary`** — same Edge Function, new prompt, versioned alongside drafts.
4. **`feature/nep-practitioner-review`** — invitation clone + review/comment capture.
5. **`feature/nep-feedback-repository`** — mostly falls out of #4's schema; a thin phase to add
   status tracking (pending/accepted/rejected/implemented) and audit history views.
6. **`feature/nep-ai-comment-reconciliation`** — depends on #4/#5 data existing.
7. **`feature/nep-version-management`** — extends the *existing* system with provenance/source
   tracking and comparison UI; done after reconciliation so there's a real "AI-reconciled draft"
   case to build the diff view against.
8. **`feature/nep-practitioner-notifications`** — email-on-submit, layered onto #4's data model.
9. **`feature/nep-iterative-review`** — mostly a UI/state-machine layer tying #4–#8 into repeatable
   cycles; needs the others done first.
10. **`feature/nep-post-publication-validation`** — depends on a real "published, done iterating"
    paper existing, so naturally last.

---

## 2. System Architecture

### 2.1 Pattern

No new pattern. This stays a **Supabase-backed SPA**: Postgres + Row-Level Security as the
authorization boundary, PostgREST auto-API for CRUD, `security definer` RPCs for anything that needs
atomicity or pre-auth access, Edge Functions for anything needing a secret (email provider key, AI
API key) or service-role privilege. React SPA talks to all three through the single `adapter`
object, same as today.

### 2.2 Module breakdown

```
src/adapters/supabase.js          existing — extended with ~20 new methods (§5)
src/adapters/mock.js              existing — mirrored 1:1 per CLAUDE.md's adapter contract rule
src/App.jsx
  ├── AdminApp                    NEW — registration queue, approve/reject
  ├── RoleSetupScreen             EXTENDED — researcher path now checks registration status
  ├── ResearcherApp (existing)
  │     ├── PapersPanel           EXTENDED — provenance tag, review status, "Invite reviewers"
  │     ├── PreviewGenPanel       NEW — AI draft + preface generation UI (job progress reuses
  │     │                          the existing GenerationPanel polling pattern)
  │     ├── FeedbackPanel         NEW — feedback repository view, status management
  │     └── ReconciliationPanel   NEW — AI reconciliation results, accept/reject per item
  └── DoctorApp (existing, role='doctor')
        ├── (existing clinical study / patient logging — untouched)
        ├── ReviewInbox           NEW — papers invited to review, section/overall comment form
        └── ValidationInbox       NEW — post-publication validation form

supabase/functions/
  ├── send-doctor-invite          existing, untouched
  ├── _shared/email-template.ts   NEW — extracted shared HTML shell (refactor of the inline
  │                                 template currently duplicated conceptually)
  ├── send-review-invite          NEW — clone of send-doctor-invite for paper review
  ├── send-review-submitted-notification   NEW — feature #8
  ├── send-validation-invite      NEW — feature #10
  ├── send-validation-submitted-notification NEW — feature #10
  └── ai-generate                 NEW — single entry point for all Claude calls (draft, preface,
                                    reconciliation), see §3.3
```

### 2.3 AI service integration approach

One Edge Function, `ai-generate`, parameterized by `task` (`draft_sections` | `preface` |
`reconciliation`), not one function per feature. Reasons: single place to hold the Anthropic API
key and rate/quota logic, single place to log every call for governance (§8), and it mirrors how
`send-doctor-invite` is the one place holding `RESEND_API_KEY` today. See §5.3 for its contract.

### 2.4 Notification architecture

Every outbound email funnels through a Resend-calling Edge Function (five total, listed above),
and every send is recorded in one new `notifications` table (not five bespoke log tables) with a
`type` discriminator column. This gives feature #1's "acknowledgement + approval/rejection email,"
feature #8's "notification after every review submission," and feature #10's "final feedback copy
by email" a single audit surface instead of three.

### 2.5 Version management architecture

Extends the existing `papers`/`paper_versions`/`paper_drafts`/RPC system — no redesign. Additions:
`source` column on `paper_drafts`/`paper_versions` (`manual`|`ai_draft`|`ai_preface`|
`reconciliation`), and a `review_cycle_id` nullable FK so a version can point back at the cycle that
produced it. Comparison/diff UI (brief asks for "version comparison") is new frontend work over
existing data — no schema change needed beyond what's listed, since every version's full
`html_content` is already stored.

### 2.6 Review workflow architecture

State machine per paper, driven by a new `paper_review_cycles` table (one row per iteration) rather
than inferring state from scattered flags:

```
draft_created → review_open → review_closed → reconciliation_done → published
                    ↑______________________________________________|
                              (repeat until researcher publishes)
```

---

## 3. Database Design

All new tables follow the existing conventions exactly: `uuid` PK via `uuid_generate_v4()`,
`org_id` FK + RLS `using(org_id = auth_org_id())`, `created_at`/`updated_at` with the existing
`update_updated_at()` trigger, additive migrations only.

### 3.1 Registration & approval (Phase 1)

```sql
create table researcher_registrations (
  id                uuid primary key default uuid_generate_v4(),
  email             text not null unique,      -- pre-auth: no org_id yet, no user row yet
  full_name         text not null,
  affiliation       text,
  orcid             text,
  research_area     text,
  intended_use      text,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  reviewed_by       uuid references users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  linked_user_id    uuid references users(id),   -- set once they actually sign in post-approval
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table users drop constraint users_role_check;
alter table users add constraint users_role_check check (role in ('doctor','researcher','admin'));
-- role='admin' is NEVER settable via completeProfile() — see §8 for how it's restricted.

-- Grandfather every existing researcher so the new approval gate doesn't lock out live accounts.
-- reviewed_by is left null (no human reviewer — this is a data migration, not a real approval)
-- and metadata on the audit_log row below records that distinction for the audit trail.
insert into researcher_registrations (email, full_name, status, reviewed_at, linked_user_id)
select u.email, coalesce(u.full_name, split_part(u.email,'@',1)), 'approved', now(), u.id
from users u
where u.role = 'researcher'
on conflict (email) do nothing;

insert into audit_log (org_id, entity_type, entity_id, action, metadata)
select u.org_id, 'registration', rr.id, 'auto_approved_grandfathered', '{"reason":"pre-existing account at gate rollout"}'
from researcher_registrations rr join users u on u.email = rr.email
where rr.status = 'approved' and rr.reviewed_by is null;
```

`registration_history` is intentionally **not** a separate table — `reviewed_by`/`reviewed_at`/
`rejection_reason` plus an append-only row in the shared `audit_log` (below) covers "approval
history, reviewer details, timestamps, audit trail" without a duplicate table.

### 3.2 Shared audit log (used by registration, feedback, reconciliation, versions)

```sql
create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid references organisations(id) on delete cascade,  -- nullable: pre-org events
  actor_id      uuid references users(id),
  actor_email   text,                     -- covers pre-auth actors (registration submitter)
  entity_type   text not null,            -- 'registration' | 'paper' | 'review' | 'feedback' | ...
  entity_id     uuid not null,
  action        text not null,            -- 'submitted' | 'approved' | 'rejected' | 'commented' | ...
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
-- append-only: RLS allows insert + select (scoped by org_id or admin), no update/delete policy.
```

### 3.3 Notifications (used by features 1, 8, 10)

```sql
create table notifications (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid references organisations(id) on delete cascade,
  type                text not null,   -- 'registration_ack' | 'registration_decision' |
                                        -- 'review_invite' | 'review_submitted' |
                                        -- 'validation_invite' | 'validation_submitted'
  recipient_email     text not null,
  recipient_user_id   uuid references users(id),
  related_entity_type text,
  related_entity_id   uuid,
  subject             text,
  payload             jsonb not null default '{}',   -- snapshot of what was sent, e.g. comment copy
  status              text not null default 'sent' check (status in ('sent','failed')),
  provider_message_id text,
  created_at          timestamptz not null default now()
);
```

### 3.4 AI jobs (used by features 2, 3, 6 — generalizes the existing `generated_papers` job shape)

```sql
create table ai_jobs (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organisations(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  paper_id      uuid references papers(id) on delete set null,
  job_type      text not null check (job_type in ('draft_sections','preface','reconciliation')),
  status        text not null default 'pending' check (status in ('pending','running','done','error')),
  stage         int default 1,
  pct           int default 0,
  log           jsonb default '[]',
  input_ref     jsonb not null default '{}',   -- e.g. {sections:[...], paperId, iteration}
  output_ref    jsonb,                          -- resulting draft_id / preface_id / reconciliation_id
  model         text,
  prompt_version text,
  error_message text,
  created_by    uuid references users(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);
```

### 3.5 Prefaces (feature #3)

```sql
create table paper_prefaces (
  id                uuid primary key default uuid_generate_v4(),
  paper_id          uuid not null references papers(id) on delete cascade,
  org_id            uuid not null references organisations(id) on delete cascade,
  version_number    int not null,
  linked_draft_id   uuid references paper_drafts(id) on delete set null,
  linked_version_id uuid references paper_versions(id) on delete set null,
  content           jsonb not null,   -- {overview, problem_statement, motivation, objectives,
                                       --  scope, methodology, expected_contributions, reviewer_guidance}
  generated_by      text not null default 'ai' check (generated_by in ('ai','manual')),
  ai_job_id         uuid references ai_jobs(id),
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  unique(paper_id, version_number)
);
```

### 3.6 Practitioner review (feature #4) — clone of the `study_invitations` pattern

```sql
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
  invited_by_user_id  uuid references users(id),
  invited_at          timestamptz not null default now(),
  last_sent_at        timestamptz,
  unique(paper_id, practitioner_email)
);

create or replace function validate_review_invite_token(p_paper_id uuid, p_token text)
returns table(valid boolean, invite_id uuid, practitioner_email text, paper_title text, expires_at timestamptz)
language sql security definer set search_path = public as $$
  select true, i.id, i.practitioner_email, p.title, i.token_expires_at
  from paper_review_invitations i join papers p on p.id = i.paper_id
  where i.paper_id = p_paper_id and i.token = p_token
    and i.token_expires_at > now() and i.invite_status in ('pending','accepted');
$$;
grant execute on function validate_review_invite_token to anon, authenticated;
```

### 3.7 Feedback repository (features #4 + #5)

```sql
create table paper_reviews (
  id                uuid primary key default uuid_generate_v4(),
  paper_id          uuid not null references papers(id) on delete cascade,
  paper_version_id  uuid not null references paper_versions(id),   -- which immutable version was reviewed
  org_id            uuid not null references organisations(id) on delete cascade,
  review_cycle_id   uuid references paper_review_cycles(id),
  reviewer_email    text not null,
  reviewer_user_id  uuid references users(id),
  overall_comments  text,
  recommendation    text check (recommendation in ('accept','minor_revisions','major_revisions','reject')),
  status            text not null default 'in_progress' check (status in ('in_progress','submitted')),
  submitted_at      timestamptz
);

create table paper_review_comments (
  id                    uuid primary key default uuid_generate_v4(),
  review_id             uuid not null references paper_reviews(id) on delete cascade,
  paper_id              uuid not null references papers(id) on delete cascade,
  org_id                uuid not null references organisations(id) on delete cascade,
  section_key           text,          -- e.g. 'introduction' | 'methodology' | null for overall
  quoted_text           text,          -- optional anchor
  comment_text          text not null,
  importance            text default 'medium' check (importance in ('low','medium','high','critical')),
  implementation_status text not null default 'pending'
                          check (implementation_status in ('pending','accepted','rejected','implemented')),
  created_at            timestamptz not null default now()
);
```

### 3.8 Iterative review cycles (feature #9)

```sql
create table paper_review_cycles (
  id                uuid primary key default uuid_generate_v4(),
  paper_id          uuid not null references papers(id) on delete cascade,
  org_id            uuid not null references organisations(id) on delete cascade,
  iteration_number  int not null,
  stage             text not null default 'draft_created'
                      check (stage in ('draft_created','review_open','review_closed',
                                        'reconciliation_done','published')),
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  unique(paper_id, iteration_number)
);
```

(`paper_reviews.review_cycle_id` above forward-references this table — create `paper_review_cycles`
first in the actual migration file.)

### 3.9 AI comment reconciliation (feature #6)

```sql
create table comment_reconciliations (
  id              uuid primary key default uuid_generate_v4(),
  paper_id        uuid not null references papers(id) on delete cascade,
  org_id          uuid not null references organisations(id) on delete cascade,
  review_cycle_id uuid not null references paper_review_cycles(id),
  ai_job_id       uuid references ai_jobs(id),
  summary         jsonb not null default '{}',  -- {duplicates:[...], conflicts:[...], themes:[...]}
  created_at      timestamptz not null default now()
);

create table comment_change_map (
  id                    uuid primary key default uuid_generate_v4(),
  reconciliation_id     uuid not null references comment_reconciliations(id) on delete cascade,
  comment_id            uuid not null references paper_review_comments(id),
  org_id                uuid not null references organisations(id) on delete cascade,
  ai_recommendation     text,
  ai_category           text,          -- 'duplicate' | 'conflicting' | 'actionable' | 'out_of_scope'
  researcher_decision   text check (researcher_decision in ('accepted','rejected','deferred')),
  implemented_in_draft_id  uuid references paper_drafts(id),
  implemented_in_version_id uuid references paper_versions(id),
  decided_by            uuid references users(id),
  decided_at            timestamptz
);
```

### 3.10 Post-publication validation (feature #10)

```sql
create table post_publication_validations (
  id                          uuid primary key default uuid_generate_v4(),
  paper_id                    uuid not null references papers(id) on delete cascade,
  final_version_id            uuid not null references paper_versions(id),
  org_id                      uuid not null references organisations(id) on delete cascade,
  practitioner_email          text not null,
  invite_id                   uuid references paper_review_invitations(id),
  finding_validation          text,
  practical_applicability     text,
  recommendations             text,
  future_research_suggestions text,
  status                      text not null default 'invited'
                                check (status in ('invited','submitted')),
  invited_at                  timestamptz not null default now(),
  submitted_at                timestamptz
);
```

"Consolidated practitioner validation report" (brief's requirement) is a **read-only view**, not a
new table — avoids a duplicate copy of data that's already fully captured above:

```sql
create view post_publication_report as
  select paper_id, count(*) filter (where status='submitted') as responses,
         count(*) as invited, array_agg(practitioner_email) as practitioners
  from post_publication_validations group by paper_id;
```

### 3.11 ER relationships summary

```
organisations 1─* users
organisations 1─* researcher_registrations (via linked_user_id, post-approval)
projects 1─* papers 1─* paper_versions
                    1─* paper_drafts
                    1─* paper_prefaces
                    1─* paper_review_invitations
                    1─* paper_review_cycles 1─* paper_reviews 1─* paper_review_comments
                                             1─* comment_reconciliations 1─* comment_change_map
                    1─* post_publication_validations
ai_jobs *─1 papers (nullable), *─1 projects (nullable)
notifications / audit_log — polymorphic via (related_entity_type, related_entity_id) or (entity_type, entity_id)
```

RLS on every new table: `using (org_id = auth_org_id())` for org members, **plus** a second policy
mirroring migration 003's email-match technique for the practitioner-facing tables
(`paper_review_invitations`, `paper_reviews`, `paper_review_comments`, `post_publication_validations`)
so an invited practitioner can read/write only their own rows without being an org member —
identical mechanism to how doctors already reach `clinical_studies` today.

---

## 4. Backend API Design

Per the existing architecture, "the API" is the `adapter` object (PostgREST CRUD + RPC + Edge
Function calls under the hood), not a hand-rolled REST layer. New adapter methods, added to
**both** `src/adapters/supabase.js` and `src/adapters/mock.js` per CLAUDE.md's adapter-contract
rule:

| Method | Backing call | Auth | Notes |
|---|---|---|---|
| `submitResearcherRegistration(data)` | insert `researcher_registrations` (anon-callable RPC, since no session exists yet) | none (pre-auth) | Triggers `registration_ack` email |
| `getMyRegistrationStatus(email)` | select `researcher_registrations` by email | none | Used by the pending-approval screen |
| `admin.listRegistrations(status?)` | select `researcher_registrations` | admin only | RLS: `role='admin'` |
| `admin.reviewRegistration(id, {decision, reason})` | update row + `audit_log` insert + trigger `registration_decision` email | admin only | |
| `generateAIDraft(paperId, sections)` | insert `ai_jobs` → invoke `ai-generate` Edge Fn | researcher, org-scoped | Returns `jobId`, polled like `startGeneration` |
| `pollAIJob(jobId)` | select `ai_jobs` | org-scoped | Mirrors `pollJob` |
| `generatePreface(paperId)` | `ai_jobs` (`job_type='preface'`) → `ai-generate` | researcher | |
| `listPrefaces(paperId)` | select `paper_prefaces` | org-scoped | |
| `inviteReviewer(paperId, {email,name})` | insert `paper_review_invitations` → invoke `send-review-invite` | researcher | Clone of `sendDoctorInvite` |
| `validateReviewInviteToken(paperId, token)` | rpc `validate_review_invite_token` | anon | Pre-login |
| `startPaperReview(paperId, inviteToken)` | insert `paper_reviews` (`status='in_progress'`) | practitioner (email-matched) | |
| `saveReviewComment(reviewId, comment)` | upsert `paper_review_comments` | practitioner | |
| `submitPaperReview(reviewId, {overallComments, recommendation})` | update `paper_reviews` + invoke `send-review-submitted-notification` | practitioner | Feature #8 |
| `listFeedback(paperId, filters)` | select `paper_review_comments` join `paper_reviews` | researcher, org-scoped | Feature #5 |
| `updateFeedbackStatus(commentId, status)` | update `paper_review_comments.implementation_status` + `audit_log` | researcher | |
| `runReconciliation(paperId, cycleId)` | insert `ai_jobs` (`job_type='reconciliation'`) → `ai-generate` | researcher | |
| `getReconciliation(cycleId)` | select `comment_reconciliations` + `comment_change_map` | org-scoped | |
| `decideOnRecommendation(mapId, {decision})` | update `comment_change_map` | researcher | Traceability write |
| `listReviewCycles(paperId)` | select `paper_review_cycles` | org-scoped | Feature #9 |
| `openNextReviewCycle(paperId)` | insert `paper_review_cycles` | researcher | State-machine advance |
| `invitePostPublicationValidation(paperId)` | reuses `paper_review_invitations` list for that paper → insert `post_publication_validations` rows → invoke `send-validation-invite` | researcher | Same practitioners as #4, per brief |
| `submitPostPublicationFeedback(id, feedback)` | update `post_publication_validations` + invoke `send-validation-submitted-notification` | practitioner | |
| `getPostPublicationReport(paperId)` | select from `post_publication_report` view | org-scoped | |

Edge Functions (Deno, `supabase/functions/*`):

| Function | Method | Purpose | Secrets used |
|---|---|---|---|
| `ai-generate` | POST | `{task, paperId, params}` → calls Anthropic, writes result, updates `ai_jobs` | `ANTHROPIC_API_KEY` |
| `send-review-invite` | POST | Clone of `send-doctor-invite` for practitioner review | `RESEND_API_KEY`, `EMAIL_FROM` |
| `send-review-submitted-notification` | POST | Emails researcher the submitted comments (feature #8) | same |
| `send-validation-invite` | POST | Feature #10 invite | same |
| `send-validation-submitted-notification` | POST | Feature #10 confirmation copy to practitioner | same |

All five are authorized the same way `send-doctor-invite` is today: called with the anon key
explicitly (not the session JWT — same ES256/HS256 gotcha noted in the existing code comment), and
they use a service-role client internally for the actual writes.

---

## 5. AI Integration Design

**Pipeline (all three AI features share this shape):**

1. Client calls the relevant adapter method (`generateAIDraft`/`generatePreface`/`runReconciliation`).
2. Adapter inserts an `ai_jobs` row (`status='pending'`) and invokes the `ai-generate` Edge Function
   with `{jobId, task, ...task-specific params}`.
3. `ai-generate` (service-role client) marks the job `running`, assembles context (see below),
   calls Anthropic once (no client-side streaming needed — matches the existing polling UX), writes
   the result into the appropriate table (`paper_drafts`, `paper_prefaces`, or
   `comment_reconciliations`/`comment_change_map`), sets `ai_jobs.status='done'` with `output_ref`
   pointing at the new row, or `'error'` with `error_message`.
4. Client polls `pollAIJob(jobId)` exactly like the existing `pollJob` UX (`GenerationPanel`).

**Context management:** for draft generation, context = `projects` + `compounds` +
`study_outcomes` + `study_references` for that project (same inputs the existing deterministic
generator already assembles client-side in `App.jsx` — reuse that assembly logic server-side rather
than re-deriving it). For preface generation, context = the same plus the current draft's
section content (preface is generated *before* the full draft per the brief, so in practice: project
+ compound + outcomes/refs, no draft yet). For reconciliation, context = all `paper_review_comments`
for the cycle + the reviewed `paper_versions.html_content`.

**Prompt management:** prompts live as versioned template strings inside `ai-generate/index.ts`,
each tagged with a `prompt_version` string stored on `ai_jobs`/`paper_prefaces` — this is the
traceability the brief asks for under "AI-generated content governance" (§8) without needing a
separate prompt-management service, which would be over-engineering at this scale.

**Draft generation constraint from the brief:** `ai-generate` for `task='draft_sections'` must
explicitly exclude Results, Analysis, and Discussion/Conclusions from its output — enforced by the
prompt instructing the model to return only the sections it's asked for, and by the response
shape being validated against an explicit allow-list of section keys before it's written into
`paper_drafts.html_content` (reject/retry if the model returns a disallowed section).

**Regeneration:** both draft and preface generation are idempotent creates — regenerating calls
`createPaperRevision`-equivalent logic (new `paper_drafts`/`paper_prefaces` row with
`source_version_number` pointing at what it was regenerated from), never overwrites, satisfying
feature #7's "never overwrite previous versions" for AI-originated content too.

---

## 6. User Roles & Permissions

| Capability | Researcher | Practitioner (`doctor`) | Admin |
|---|---|---|---|
| Sign up / sign in | Yes (OTP/Google, existing) | Yes, invite-only (existing) | **Not self-serve — see below** |
| Full researcher workspace (projects, evidence, papers) | Yes, after registration approval (new gate) | No | No |
| Submit registration application | N/A (does it once, pre-account) | N/A | N/A |
| Review registration queue, approve/reject | No | No | Yes |
| Generate AI draft / preface | Yes, own org's papers | No | No |
| Receive review invite, submit review + comments | No | Yes, per-paper invite | No |
| View feedback repository, change implementation status | Yes, own org's papers | No (own submissions only, read-only) | No |
| Run/view AI reconciliation | Yes | No | No |
| Accept/reject AI recommendations | Yes | No | No |
| Version history / compare / restore | Yes, own org's papers | No | No |
| Receive post-publication validation invite, submit | No | Yes, if previously invited to review | No |
| View audit log / notification history | Own org's, implicitly via feature UIs | No | All orgs |

**Decided:** Admin is a separate role on the same login system (OTP/Google — no new auth
mechanism), but admin accounts are created and managed **outside** the researcher registration
flow — never reachable via `completeProfile()` or any self-serve path. Provisioning is a manual,
out-of-band operation (`update users set role='admin' where id=...`), consistent with Option (a)
above.

**Decided:** researcher registration approval **replaces** self-service researcher signup going
forward — every new researcher lands in Pending Approval and is blocked from researcher features
until an admin approves them. This is an intentional, explicit product change, not a side effect.
See §1.5 for the migration handling of accounts that already exist under the old self-serve model.

---

## 7. Workflow Diagrams

**Researcher registration:**
```
Applicant fills form (no account yet)
  → submitResearcherRegistration()  → status=pending, registration_ack email sent
  → Admin reviews queue (AdminApp)
      → approve  → status=approved, registration_decision email sent, audit_log row
      → reject   → status=rejected, registration_decision email (with reason), audit_log row
  → Applicant signs in via existing OTP/Google
      → RoleSetupScreen: researcher path now checks researcher_registrations.status
          → approved  → completeProfile() proceeds as today
          → pending/rejected/none → blocked, shown status screen instead
```

**Draft + preface generation:**
```
Researcher has validated evidence (existing ValidateTab)
  → generatePreface(paperId) → ai_jobs → ai-generate → paper_prefaces v1
  → researcher reviews/edits preface
  → generateAIDraft(paperId, sections) → ai_jobs → ai-generate → paper_drafts (source='ai_draft')
  → researcher edits draft manually as needed (existing PapersPanel editing)
  → publishPaperDraft() (existing RPC) → paper_versions v1
```

**Practitioner review → reconciliation → new version (iterative, feature #9's loop):**
```
paper_review_cycles row created (stage=draft_created)
  → inviteReviewer() → send-review-invite email → practitioner opens tokenised link
  → startPaperReview() → practitioner adds paper_review_comments, submits
      → submitPaperReview() → send-review-submitted-notification to researcher (feature #8)
  → all invited practitioners submitted (or researcher closes early) → stage=review_closed
  → runReconciliation() → ai-generate → comment_reconciliations + comment_change_map (feature #6)
  → researcher works through comment_change_map: accept/reject each → stage=reconciliation_done
  → createPaperRevision()-equivalent seeded from accepted changes → new paper_drafts (source='reconciliation')
  → researcher edits, publishes → paper_versions vN → stage back to draft_created for next cycle,
    or → stage=published when researcher decides to stop iterating
```

**Post-publication validation:**
```
Paper reaches final published version, researcher triggers "Send for validation"
  → invitePostPublicationValidation() → reuses the paper's existing reviewer list
  → send-validation-invite (final paper + prior-version diff + change summary)
  → practitioner submits finding_validation / applicability / recommendations / future_research
      → submitPostPublicationFeedback() → send-validation-submitted-notification (feedback copy back to practitioner)
  → researcher views post_publication_report (consolidated view)
```

---

## 8. Security Considerations

- **RLS is the authorization boundary, not app code** — every new table gets an org-scoped policy
  plus, where an external non-org actor needs access (practitioner, pre-approval applicant), a
  narrowly-scoped email-match or token-match policy, exactly like migration 003 already does. No
  new authorization mechanism is introduced.
- **`role='admin'` must never be reachable from `completeProfile()`** — that RPC already only
  accepts `'doctor'|'researcher'` (existing check); this design keeps that check as-is rather than
  loosening it, so admin promotion stays a manual, out-of-band DB operation (§6).
- **Review/validation tokens** reuse the proven pattern: `crypto.getRandomValues` 32-byte token,
  7-day expiry, `security definer` validation RPC grantable to `anon`, no way to enumerate valid
  tokens (unique + indexed, never returned in list endpoints).
- **Document access**: a practitioner's RLS policy must scope strictly to the `paper_id` they were
  invited to (via `paper_review_invitations`/`post_publication_validations` email match), never to
  "all papers in that org" — mirrors how a doctor today can only reach the specific
  `clinical_studies` row they're invited to, not their inviting researcher's whole org.
- **Audit logging**: `audit_log` is insert-and-select only (no update/delete RLS policy), so
  approval history and comment-decision history can't be quietly edited after the fact.
- **Email security**: continues using Resend from the already-configured sending domain with
  `reply_to` set to the actual researcher, not a shared address — same as `send-doctor-invite`
  today. No new domain/DKIM/SPF work implied.
- **AI-generated content governance**: every AI-produced draft/preface/reconciliation item is
  tagged with `source`/`generated_by`/`model`/`prompt_version` and requires an explicit researcher
  action (publish, or accept-in-reconciliation) before it affects a published version — the
  existing `publish_paper_draft` gate already enforces "nothing becomes canonical without a human
  step," which this design relies on rather than re-implements.
- **Data privacy**: practitioner PII (email/name) already flows through the existing
  `study_invitations` pattern in production today; new tables carry the same fields under the same
  RLS discipline — no new privacy surface being opened, but worth confirming your privacy policy
  already covers "practitioner reviews are stored and may be emailed back to them," since feature
  #8/#10 explicitly email content back to the submitter.

---

## Next step

This is the design only. Per the brief's own rule ("do not proceed to the next phase until the
current phase is fully implemented and verified") and the implementation-strategy instructions,
nothing gets built until you tell me to start Phase 1 — and Phase 1 has one open product question
(§6: who becomes admin, and are you comfortable gating future researcher signups behind approval
starting now). Flag any part of this design you want changed before that.
