# ISSUES.md — Known Bugs & Missing Features

This is the living issue tracker for Claude Code and developers.
Update this file when fixing issues or discovering new ones.

Format: `[STATUS] Description — notes`
STATUS: `[ ]` open · `[x]` fixed · `[~]` partial · `[!]` blocker

---

## 🔴 Blockers (must fix before next sprint)

- [ ] **Data resets on refresh** — MockAdapter stores in JS memory.
  Fix: add localStorage persistence as a testing bridge until Sprint 2 Supabase.
  File: `src/App.jsx` → `MockAdapter._STORE` → persist to `localStorage`

- [ ] **PDF download not working** — shows "open .docx in Word" alert.
  Fix (Sprint 3): backend LibreOffice headless conversion.
  Workaround: user opens .docx → File → Save As → PDF.

---

## 🟡 High priority bugs

- [ ] **Quality Score Q stays at placeholder "Q score"** when user forgets to select.
  Validation catches it but the UX is confusing — the dropdown should default
  to empty with a red border if the form is submitted with it unset.
  File: `src/App.jsx` → `OutcomeRow` → Quality Score Select

- [ ] **I² field accepts invalid values** (e.g. user entered 805 during testing).
  Should validate 0–100 range with a red border and tooltip "I² must be 0–100".
  File: `src/App.jsx` → `OutcomeRow` → I² input

- [ ] **p-value "0.8" shown as Significant** — no cross-validation between
  p-value field and Significance dropdown. Should warn if p > 0.05 but
  Significance = "Significant", or auto-suggest "Not Significant".
  File: `src/App.jsx` → `OutcomeRow` → upd() function

- [ ] **CI Lower/Upper not validated** — CI Lower should be < CI Upper.
  Currently accepts -10 as CI Lower and positive as CI Upper with no warning.
  File: `src/App.jsx` → `OutcomeRow` → upd() function

- [ ] **Effect size value not validated** — accepts letters and symbols.
  Should be numeric only with a warning on non-numeric input.
  File: `src/App.jsx` → `OutcomeRow` → Effect Size input

- [ ] **MCID_Met=Yes with no threshold shows ⚠ but doesn't block generation**
  The warning icon appears inline but it doesn't surface in the validation
  checklist unless the server check is run explicitly.
  File: `src/App.jsx` → `ValidationPanel` → client-side checks

---

## 🟢 Missing features (planned)

- [ ] **localStorage persistence** — save project/outcomes/refs to localStorage
  so data survives page refresh during local testing.
  Simple: JSON.stringify the _STORE on every write, JSON.parse on load.

- [ ] **Outcome duplication** — "Duplicate this row" button on each OutcomeRow
  to quickly copy a study's outcome with a different outcome name.

- [ ] **Import from Excel** — upload the NEP Production Template .xlsx and
  parse it into the app. Sprint 5 feature.

- [ ] **Export to Excel** — download current project as a pre-populated
  NEP Production Template .xlsx.

- [ ] **Auto-populate compound fields** — when user types a known compound
  name (Ashwagandha, Curcumin, etc.) suggest scientific name, extract form,
  standardisation from a lookup table.

- [ ] **MCID auto-suggest** — when user types an outcome name in Evidence Input,
  check MCID_LIB and auto-populate MCID Met field if a match is found.

- [ ] **Real paper generation** — Sprint 3.
  Currently generates client-side only. Real version:
  POST /generate → Anthropic API for Introduction + Discussion expansion
  → .docx via node.js paper engine → S3 storage → pre-signed download URL.

- [ ] **Paper version history** — every generation stored, user can compare
  and restore previous versions.

- [ ] **Supabase auth** — Sprint 2.
  Replace MockAdapter with SupabaseAdapter.
  Files: `src/adapters/supabase.js` (already scaffolded).

- [ ] **Stripe billing** — Sprint 4.
  Plan enforcement, usage metering, upgrade prompts.

- [ ] **Public API** — Sprint 5.
  /v1/ REST endpoints, API key management, OpenAPI docs.

---

## 🔵 UI/UX improvements

- [ ] **Collapsed outcome row is too wide** for screens < 1200px.
  Columns overflow on smaller monitors.

- [ ] **No empty state guidance on References tab** — user doesn't know
  what format to use. Add an example reference row as placeholder.

- [ ] **Bias domain labels** only show for RoB 2, ROBINS-I, AMSTAR 2.
  NOS and Jadad tools show D1–D5 which is wrong.
  File: `src/App.jsx` → `OutcomeRow` → `biasDomainLabels` object

- [ ] **Score ring animation doesn't replay** when values change.
  SVG stroke-dashoffset transition works on first render but not on update.

- [ ] **Project settings panel** doesn't close on Escape key.

- [ ] **No keyboard navigation** between outcome row fields (Tab order broken
  because of grid layout).

- [ ] **Loading state on Generate button** — button doesn't disable while
  fflate loads for the first time (~1s delay).

---

## ✅ Fixed

- [x] **OTP sign-in for a brand-new email skipped Registration** — the
  `handle_new_user` trigger (migrations 005–009) defaulted every new
  `public.users` row to `role='researcher'`, so the frontend's new-vs-existing
  check (`role not in ('doctor','researcher')`) could never detect a genuinely
  new signup and logged them straight in instead of routing to Registration.
  Fixed: migration `011_new_users_no_default_role.sql` leaves `role` NULL for
  brand-new signups; `completeProfile()` sets it once Registration completes.
  Files: `supabase/migrations/011_new_users_no_default_role.sql`,
  `src/adapters/supabase.js` (`needsRoleFor`).

- [x] **Google sign-in sometimes bounced back to the Sign In screen** —
  `getCurrentUser()` treated a profile row that hadn't propagated yet (a race
  right after the OAuth redirect, before PostgREST saw the trigger's insert)
  as evidence the user had been deleted, and force-signed them out. Fixed:
  `getCurrentUser()` now retries the profile lookup like `verifyOtp()` already
  did before giving up. Also stripped the one-time `?code=`/`#access_token=`
  params from the URL after a successful resolve so a refresh can't retry an
  already-used code. File: `src/adapters/supabase.js`, `src/App.jsx`.

- [x] **ValidateTab hooks error** — `useState` called inside IIFE in render.
  Fixed: extracted as proper `ValidateTab` component.

- [x] **highlightCs XML error** — invalid Word XML attribute in placeholder tags.
  Fixed: stripped from document.xml after generation.

- [x] **.docx Word error on open** — hand-rolled ZIP builder produced
  malformed byte offsets. Fixed: replaced with fflate library.

- [x] **Download buttons used placeholder hrefs** (#download-docx).
  Fixed: wired to real `buildDocxBlob` + `downloadBlob` functions.

- [x] **GenerationPanel used local simulate()** instead of API.startGeneration.
  Fixed: replaced with real async job polling via API.startGeneration / API.pollJob.

---

## Sprint roadmap

| Sprint | Status | Key deliverables |
|--------|--------|-----------------|
| 1 | ✅ Done | Full UI, mock adapter, live scoring, client-side docx |
| 2 | 🔜 Next | Supabase auth + DB, localStorage bridge, field validation |
| 3 | Planned | Real paper engine (Anthropic API), PDF, S3 storage |
| 4 | Planned | Stripe billing, plan enforcement |
| 5 | Planned | Public API, Excel import/export, version history |
