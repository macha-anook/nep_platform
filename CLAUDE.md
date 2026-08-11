# CLAUDE.md — Instructions for Claude Code

This file tells Claude Code how to work on this repository.
Read this before making any changes.

---

## Project overview

NEP Platform — Nutraceutical Evidence Platform.
A React SPA that captures structured evidence, computes GRADE-aligned
Weighted Scores, and generates IMRaD manuscripts.

**Current sprint: Sprint 1 (complete)**
Everything runs on a MockAdapter — no real backend yet.

**Next sprint: Sprint 2**
Wire Supabase for real auth + database persistence.

---

## Repository structure

```
nep-platform/
├── src/
│   ├── App.jsx              ← entire frontend application (~2,300 lines)
│   ├── main.jsx             ← React entry point, mounts <Root/>
│   └── adapters/
│       ├── mock.js          ← in-memory adapter (current default)
│       └── supabase.js      ← Supabase adapter (Sprint 2, not yet active)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  ← full DB schema, run in Supabase SQL editor
├── public/
│   └── favicon.svg
├── .github/
│   └── workflows/
│       ├── ci.yml           ← build + lint on every push
│       └── deploy.yml       ← deploy to Vercel on push to main
├── .env.example             ← copy to .env.local for real backend
├── CLAUDE.md                ← YOU ARE HERE
├── ISSUES.md                ← known bugs and missing features to fix
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── README.md
```

---

## How to run locally

```bash
npm install
npm run dev
# Open http://localhost:5173
# Login: demo@nep.science / demo123
```

No environment variables needed — MockAdapter runs entirely in memory.

---

## Active adapter

The active adapter is set in `src/App.jsx` at the top of the MockAdapter section:

```js
const API = MockAdapter   // ← this line controls which adapter is used
```

To switch to Supabase: set `VITE_API_ADAPTER=supabase` in `.env.local`
(the adapter switching logic is in `src/main.jsx`).

---

## Scoring engine — DO NOT CHANGE without explicit instruction

The WS formula is an exact port of the NEP Excel model (verified).
Any change to scoring logic must be verified against the Excel workbook.

```
WS = Q + S + O − B
Not Significant: additional −2, hard cap at 8, floor 0
Significant: hard cap at 15, floor 0
Sample_Score: n≥200=5, 100-199=4, 50-99=3, 20-49=2, <20=1, blank=0
ESS = mean(WS) across all outcomes with WS > 0
```

---

## API adapter contract

Every adapter (Mock, Supabase, REST) must implement these 20 methods.
**Adding a method requires updating ALL adapters.**

| Method | Returns |
|--------|---------|
| `signIn({email, password})` | `User` |
| `signUp({email, password, name})` | `User` |
| `signOut()` | `void` |
| `getSession()` | `User \| null` (sync) |
| `listProjects()` | `Project[]` |
| `createProject(data)` | `Project` |
| `updateProject(id, data)` | `Project` |
| `deleteProject(id)` | `void` |
| `saveCompound(projectId, data)` | `Compound` |
| `getCompound(projectId)` | `Compound \| null` |
| `listOutcomes(projectId)` | `Outcome[]` |
| `saveOutcome(projectId, outcome)` | `Outcome` |
| `deleteOutcome(projectId, outcomeId)` | `void` |
| `listRefs(projectId)` | `Ref[]` |
| `saveRef(projectId, ref)` | `Ref` |
| `deleteRef(projectId, refId)` | `void` |
| `validate(projectId)` | `{issues[], warnings[], ready}` |
| `startGeneration(projectId)` | `jobId: string` |
| `pollJob(jobId)` | `Job \| null` |
| `submitResearcherRegistration({email,fullName,...})` | `Registration` |
| `getRegistrationStatus(email)` | `{status, rejectionReason}` |
| `listRegistrations(status?)` | `Registration[]` (admin only) |
| `reviewRegistration(id, {decision, reason?})` | `Registration` (admin only) |
| `generateAIDraft(projectId, {paperId?, sections?})` | `{jobId, paperId, draftId}` |
| `pollAIJob(jobId)` | `AiJob \| null` |
| `inviteReviewer(paperId, {email, name})` | `{success, emailId, token}` |
| `listReviewInvitations(paperId)` | `ReviewInvitation[]` |
| `validateReviewInviteToken(paperId, token)` | `{valid, invite_id?, practitioner_email?, paper_title?, expires_at?}` |
| `markReviewInviteAccepted(paperId, email)` | `void` |
| `listMyReviewInvitations(email)` | `ReviewInvitation[]` (practitioner) |
| `getPaperForReview(paperId)` | `{id, title, compound, version, htmlContent, fileName, fileData, fileSize}` (practitioner) |
| `startPaperReview(paperId)` | `Review` |
| `saveReviewComment(reviewId, comment)` | `Comment` |
| `listReviewComments(reviewId)` | `Comment[]` |
| `submitPaperReview(reviewId, {overallComments, recommendation})` | `Review` |
| `listPaperFeedback(paperId)` | `Review[]` (each with nested comments) |
| `listAllFeedback()` | `Review[]` (every paper in the org, each with nested comments) |
| `updateCommentStatus(commentId, status)` | `Comment` |
| `listCommentHistory(commentId)` | `AuditLogEntry[]` |
| `restorePaperVersion(versionId)` | `Draft` — branches a new draft from an arbitrary past version |
| `listNotifications(type?)` | `Notification[]` |
| `listReviewCycles(paperId)` | `ReviewCycle[]` |
| `closeReviewCycle(cycleId)` | `ReviewCycle` |
| `invitePostPublicationValidation(paperId)` | `{email, success, error?}[]` — re-invites every past reviewer |
| `validatePpvToken(paperId, token)` | `{valid, validation_id?, practitioner_email?, paper_title?, expires_at?}` |
| `listMyValidationInvitations(email)` | `Validation[]` (practitioner) |
| `getPaperForValidation(paperId)` | `{..., previousVersion, implementedChanges}` (practitioner) |
| `getMyValidation(paperId)` | `Validation` (practitioner) |
| `submitPostPublicationFeedback(id, {findingValidation, practicalApplicability, recommendations, futureResearchSuggestions})` | `Validation` |
| `getPostPublicationReport(paperId)` | `{paper_id, invited, responses, practitioners}` |

---

## Key design decisions

1. **Scoring is computed client-side** — `score.*` functions in App.jsx.
   Auto-save sends computed `_ws`, `_biasP`, `_sampleScore` to the DB.

2. **Generation is always async** — `startGeneration` returns a jobId,
   `pollJob` is called every 300ms until `status === "done" | "error"`.

3. **Multi-tenant via org_id** — every DB table has `org_id`.
   Row-Level Security enforces isolation at DB layer.

4. **Auto-save debounced 800ms** — every field change schedules a save.
   `SaveIndicator` shows "Saving…" / "Saved" in the top bar.

5. **fflate for .docx ZIP** — loaded from jsDelivr CDN on first download.
   `buildDocxBlob` is async because fflate.zip is async.

---

## Known issues — see ISSUES.md for full list

- Data resets on page refresh (by design — Mock adapter, Sprint 2 fixes this)
- PDF download not implemented (requires backend LibreOffice, Sprint 3)
- No localStorage persistence yet
- Paper engine generates client-side only — no AI expansion yet (Sprint 3)

---

## Branch strategy

```
main        ← production, auto-deploys to Vercel
develop     ← integration branch, CI runs on push
feature/*   ← individual features, PR into develop
fix/*       ← bug fixes, PR into develop or main
sprint-2/*  ← sprint 2 work (Supabase wiring)
```

---

## When making changes

1. Read ISSUES.md first — check if the bug is already tracked
2. Make the minimal change that fixes the problem
3. Do not refactor unrelated code in the same commit
4. Test locally with `npm run dev` before committing
5. Update ISSUES.md to mark fixed items
6. Keep App.jsx as a single file — do not split into multiple components yet
   (splitting is planned for Sprint 2 when we move to proper file structure)
