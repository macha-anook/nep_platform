// NEP Platform — AI Generation Edge Function
// Single entry point for every Claude-backed generation task (draft sections
// now; preface / comment reconciliation reuse this in later phases via
// job_type). Reconnects the Anthropic integration already proven out in
// api/claude.js (same model, same request shape) — that Vercel function
// stays in place but is superseded by this path for new AI features so the
// service-role DB access needed to read project data and write results
// lives in one place, consistent with how send-doctor-invite already works.
//
// Deploy: supabase functions deploy ai-generate
//
// Supabase secrets required (Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — NEW secret for this function (api/claude.js only
//                        ever had this as a Vercel env var, not a Supabase one)
//
// Auto-injected by Supabase (no manual secret needed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// @ts-nocheck — Deno runtime; VS Code TS errors are expected and harmless

import { serve }         from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }   from "../_shared/cors.ts";

// Configurable via the ANTHROPIC_MODEL Supabase secret so a retired/
// unavailable model can be swapped without a code change + redeploy.
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5";

function anthropicErrorMessage(data) {
  const type = data?.error?.type;
  const msg = data?.error?.message || "Anthropic API error";
  if (/^model:/i.test(msg)) {
    return `${msg} — check console.anthropic.com for models available to this API key, ` +
      `then update the ANTHROPIC_MODEL Supabase secret.`;
  }
  if (type === "overloaded_error") return "The AI service is temporarily overloaded — please try again in a minute.";
  if (type === "rate_limit_error") return "Too many AI requests right now — please wait a moment and try again.";
  if (type === "authentication_error") return "AI generation isn't configured correctly on this platform — contact your administrator.";
  return `AI generation failed: ${msg}`;
}

const PROMPT_VERSION_DRAFT = "draft-narrative-v2";
const PROMPT_VERSION_PREFACE = "preface-v1";
const PROMPT_VERSION_RECONCILE = "reconciliation-v1";
const PROMPT_VERSION_RECONCILE_APPLY = "reconciliation-apply-v2";

// The only fields AI is ever allowed to author. Abstract stats and Results
// tables are always computed client-side (buildDocxBlob, src/App.jsx) from
// live outcome/scoring data — the AI never sees or writes numbers, it only
// writes prose grounded in numbers it's given.
// Matches buildDocxBlob's (src/App.jsx) subsection structure exactly:
// "discussion" = 4.1 Evidence Strength and Consistency, "bioavailability" =
// 4.2 Bioavailability and Formulation Considerations — the only two
// Discussion subsections that are narrative rather than fully templated;
// 4.3-4.5 (Statistical vs Clinical Significance, Risk of Bias, Limitations)
// are always deterministic and never touched by AI.
const NARRATIVE_FIELDS = ["introduction", "discussion", "bioavailability", "conclusions"];
// Section labels a comment/recommendation can be routed to. Must match
// section_key values practitioners actually pick and buildDocxBlob's own
// heading names (Abstract/Results/Methods are ALWAYS computed — never
// AI-editable — but a comment can still legitimately be *about* one of them).
const RECONCILE_SECTIONS = ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusions", "General"];
// The subset of the above that AI-driven reconciliation is actually allowed
// to rewrite. Anything else (Abstract stats, Results/tables) must be fixed
// by correcting the underlying outcome/study data, never by editing prose.
const NARRATIVE_EDITABLE_SECTIONS = ["Introduction", "Discussion", "Conclusions"];

const PREFACE_FIELDS = [
  "overview", "problem_statement", "motivation", "objectives",
  "scope", "methodology", "expected_contributions", "reviewer_guidance",
];

function buildContext(project, compound, outcomes, refs, metrics) {
  const lines = [];
  lines.push(`Paper title (working): ${project?.paper_title || "(untitled)"}`);
  lines.push(`Target journal: ${project?.target_journal || "(unspecified)"}`);
  lines.push(`Existing keywords: ${project?.keywords || "(none provided)"}`);
  lines.push("");
  lines.push(`Compound: ${compound?.compound_name || "(unknown)"} (${compound?.scientific_name || ""})`);
  lines.push(`Extract form: ${compound?.extract_form || "—"} · Standardisation: ${compound?.standardisation || "—"}`);
  lines.push(`Typical dose range: ${compound?.dose_range || "—"} · Duration range: ${compound?.duration_range || "—"}`);
  lines.push("");
  lines.push(`Study outcomes on file (${outcomes.length} total, showing up to 40):`);
  outcomes.slice(0, 40).forEach((o, i) => {
    lines.push(`${i + 1}. [${o.study_ref_id || o.study_id || "?"}] ${o.outcome_name || "?"} — ` +
      `${o.study_type || "?"} study, population: ${o.population || "?"}, n=${o.sample_n ?? "?"}`);
  });
  lines.push("");
  lines.push(`References on file (${refs.length} total, showing up to 60):`);
  refs.slice(0, 60).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.authors || "?"} (${r.year || "?"}). ${r.title || "?"}. ${r.journal || ""}.`);
  });
  if (metrics) {
    lines.push("");
    lines.push(`COMPUTED EVIDENCE METRICS (source of truth — cite these exact figures, never alter or invent numbers):`);
    lines.push(`Evidence Strength Score (ESS): ${metrics.ess ?? "—"} (${metrics.essC || "—"})`);
    lines.push(`GRADE-parallel certainty estimate: ${metrics.grade || "—"}`);
    lines.push(`Outcome consistency: ${metrics.consC || "—"} · Clinical significance: ${metrics.clinC || "—"}`);
    lines.push(`Bias profile: ${metrics.biasC || "—"} (mean bias penalty ${metrics.meanBias ?? "—"}/5.0)`);
    lines.push(`Studies: ${metrics.nStudies ?? "—"}, Participants: ${metrics.parts ?? "—"}, Outcomes assessed: ${metrics.nOutcomes ?? "—"}`);
    if (metrics.topOutcome) lines.push(`Strongest outcome: ${metrics.topOutcome}`);
    if (Array.isArray(metrics.outcomes) && metrics.outcomes.length) {
      lines.push(`Outcome-level scores:`);
      metrics.outcomes.slice(0, 20).forEach((o, i) => {
        lines.push(`  ${i + 1}. ${o.name || "?"} — direction=${o.direction || "?"}, significance=${o.significance || "?"}, WS=${o.ws ?? "?"}, n=${o.n ?? "?"}, MCID met=${o.mcidMet ? "yes" : "no"}`);
      });
    }
  }
  return lines.join("\n");
}

function narrativeSystemPrompt() {
  return `You are an expert medical writer drafting the NARRATIVE sections of a nutraceutical ` +
    `clinical evidence-synthesis research paper in IMRaD style for the NEP Platform. You will be ` +
    `given structured data about a compound, its study outcomes, references, and COMPUTED EVIDENCE ` +
    `METRICS (Weighted Scores, Evidence Strength Score, GRADE estimate).

You write ONLY prose — Introduction, and two Discussion subsections (Evidence Strength/Consistency ` +
    `interpretation, and Bioavailability/Formulation considerations), and Conclusions. Every other ` +
    `part of this paper (Title, Abstract statistics, Methods, Results tables, Statistical vs Clinical ` +
    `Significance, Risk of Bias, Limitations) is generated deterministically from live database ` +
    `records and computed scores, NOT by you — never write those sections.

The computed evidence metrics you are given are the source of truth. Cite them exactly as given ` +
    `(e.g. the ESS value, GRADE certainty, outcome-level Weighted Scores) — never invent, alter, ` +
    `round differently, or contradict a number you were given. If a metric isn't given, don't state ` +
    `a number for it.

Return ONLY a single JSON object with exactly these keys, each a string of flowing academic prose ` +
    `(no headings, no markdown, no bullet points): "introduction" (500-700 words: health burden, ` +
    `limitations of conventional care, the compound's background/mechanism, existing evidence ` +
    `landscape, rationale for this synthesis), "discussion" (400-500 words: interpretation of the ` +
    `ESS/GRADE classification and key outcome findings), "bioavailability" (250-350 words: formulation ` +
    `standardisation and bioavailability considerations for this compound/extract), "conclusions" ` +
    `(150-200 words: a cohesive summary paragraph with a clear recommendation for ` +
    `clinicians/researchers).

No text outside the JSON object, no markdown code fences, no commentary.`;
}

function prefaceSystemPrompt() {
  return `You are an expert medical writer producing a PREFACE (executive summary) for a ` +
    `nutraceutical clinical evidence-synthesis research paper on the NEP Platform, written ` +
    `BEFORE the full draft is generated, from the compound/outcome/reference data you are given.

Return ONLY a single JSON object with exactly these keys, each a string of 2-5 sentences: ` +
    `overview, problem_statement, motivation, objectives, scope, methodology, ` +
    `expected_contributions, reviewer_guidance.

"reviewer_guidance" should speak directly to the practitioner who will review this paper — ` +
    `what to focus on and what to sanity-check given the evidence on file.

Do not include any text outside the JSON object, no markdown code fences, no commentary. Do ` +
    `not fabricate specific numeric results beyond what is given below.`;
}

// Shared by preface and comment-reconciliation, both of which need
// structured JSON back rather than manuscript HTML.
// Claude is asked for multi-sentence (sometimes multi-paragraph) prose
// inside JSON string values. It reliably escapes quotes/backslashes but
// will sometimes emit a literal newline between paragraphs instead of the
// `\n` escape sequence — valid-looking text, invalid JSON. Walk the raw
// text tracking whether we're inside a string literal (toggling on
// unescaped `"`) and escape any bare control character found there; JSON
// structure (whitespace between tokens) is untouched since it's only ever
// outside a string.
function sanitizeJsonControlChars(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === "\"") { inString = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
    } else {
      if (ch === "\"") inString = true;
      out += ch;
    }
  }
  return out;
}

async function callClaudeForJson(anthropicKey, systemPrompt, userContent, maxTokens, errorLabel) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": anthropicKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(anthropicErrorMessage(data));
  const raw = (data.content || []).map(b => b.text || "").join("\n").trim();

  // Models sometimes wrap JSON in a code fence, or add stray text before/
  // after the object, despite instructions not to — strip both defensively.
  let jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace > 0 || lastBrace < jsonText.length - 1) {
    if (firstBrace !== -1 && lastBrace > firstBrace) jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  try { return JSON.parse(jsonText); }
  catch (e) {
    try { return JSON.parse(sanitizeJsonControlChars(jsonText)); }
    catch (e2) { throw new Error(`AI generation${errorLabel ? ` for ${errorLabel}` : ""} returned an unexpected response — please try again.`); }
  }
}

async function callClaudeForPreface(anthropicKey, contextText) {
  const parsed = await callClaudeForJson(anthropicKey, prefaceSystemPrompt(), contextText, 3000, "the preface");
  const content = {};
  for (const key of PREFACE_FIELDS) content[key] = typeof parsed[key] === "string" ? parsed[key] : "";
  return content;
}

async function handlePreface(adminClient, anthropicKey, job, jobId) {
  const { data: project, error: projErr } = await adminClient
    .from("projects").select("*").eq("id", job.project_id).eq("org_id", job.org_id).single();
  if (projErr || !project) throw new Error("Project not found for this job's organisation");

  const [{ data: compound }, { data: outcomes }, { data: refs }] = await Promise.all([
    adminClient.from("compounds").select("*").eq("project_id", job.project_id).maybeSingle(),
    adminClient.from("study_outcomes").select("*").eq("project_id", job.project_id),
    adminClient.from("study_references").select("*").eq("project_id", job.project_id),
  ]);
  const contextText = buildContext(project, compound, outcomes || [], refs || [], job.input_ref?.metrics);

  await adminClient.from("ai_jobs").update({ stage: 2, pct: 40 }).eq("id", jobId);
  const content = await callClaudeForPreface(anthropicKey, contextText);
  await adminClient.from("ai_jobs").update({ stage: 3, pct: 70 }).eq("id", jobId);

  let paperId = job.paper_id;
  if (!paperId) {
    const title = project.paper_title || `${compound?.compound_name || "Untitled"} Evidence Synthesis`;
    const { data: newPaper, error: paperErr } = await adminClient
      .from("papers")
      .insert({ org_id: job.org_id, project_id: job.project_id, title, compound: compound?.compound_name || "", current_version: 0, created_by: job.created_by })
      .select().single();
    if (paperErr) throw new Error(`Failed to create paper: ${paperErr.message}`);
    paperId = newPaper.id;
  }

  // Link to whatever draft/version currently exists — "the relationship
  // between preface versions and paper versions" the brief asks for.
  const [{ data: latestDraft }, { data: currentVersion }] = await Promise.all([
    adminClient.from("paper_drafts").select("id").eq("paper_id", paperId)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    adminClient.from("paper_versions").select("id").eq("paper_id", paperId).eq("is_current", true).maybeSingle(),
  ]);

  const { count: priorCount } = await adminClient
    .from("paper_prefaces").select("id", { count: "exact", head: true }).eq("paper_id", paperId);

  const { data: preface, error: prefaceErr } = await adminClient
    .from("paper_prefaces")
    .insert({
      paper_id: paperId, org_id: job.org_id,
      version_number: (priorCount || 0) + 1,
      linked_draft_id: latestDraft?.id || null,
      linked_version_id: currentVersion?.id || null,
      content, generated_by: "ai", ai_job_id: jobId, created_by: job.created_by,
    })
    .select().single();
  if (prefaceErr) throw new Error(`Failed to create preface: ${prefaceErr.message}`);

  await adminClient.from("ai_jobs").update({
    status: "done", stage: 3, pct: 100,
    model: ANTHROPIC_MODEL, prompt_version: PROMPT_VERSION_PREFACE,
    output_ref: { paperId, prefaceId: preface.id },
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);

  return { success: true, paperId, prefaceId: preface.id };
}

const RECONCILE_CATEGORIES = ["duplicate", "conflicting", "actionable", "out_of_scope"];
const RECONCILE_IMPORTANCE = ["low", "medium", "high", "critical"];
const RECONCILE_ACTIONS = ["implement", "partially_implement", "discuss", "decline"];

function stripHtmlToText(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function reconciliationSystemPrompt() {
  return `You are analyzing practitioner review comments on a nutraceutical evidence-synthesis ` +
    `research paper draft, for the NEP Platform. You will be given the current draft content and ` +
    `a list of comments, each with an id, section, reviewer, practitioner-assigned importance, ` +
    `and text.

For EACH comment, decide:
- category: one of "duplicate" (says the same thing as another comment), "conflicting" ` +
    `(contradicts another comment's suggestion), "actionable" (a clear, implementable change), or ` +
    `"out_of_scope" (not something this draft can address).
- duplicate_of: if category is "duplicate", the id of the earlier comment it duplicates, else null.
- conflicts_with: if category is "conflicting", the id of the comment it conflicts with, else null.
- importance: your OWN assessment (low/medium/high/critical) of how important this feedback is to ` +
    `the paper's quality — independent of what the reviewer marked, and it may differ from it.
- affected_section: which section of the paper actually needs to change to address this comment — ` +
    `one of "Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusions", or ` +
    `"General". This is YOUR determination of what needs editing, which may differ from the section ` +
    `the practitioner was looking at when they left the comment (e.g. a comment left on the Abstract ` +
    `might really require an Introduction edit).
- recommended_action: one of "implement", "partially_implement", "discuss" (needs researcher ` +
    `judgement), or "decline".
- recommendation: one or two sentences explaining your reasoning and, if actionable, what change ` +
    `to make.

Return ONLY a JSON object: {"items": [{"comment_id": "...", "category": "...", ` +
    `"duplicate_of": null, "conflicts_with": null, "importance": "...", "affected_section": "...", ` +
    `"recommended_action": "...", "recommendation": "..."}, ...]} — exactly one item per comment ` +
    `id given. No text outside the JSON, no markdown code fences.`;
}

async function handleReconciliation(adminClient, anthropicKey, job, jobId) {
  const reviewCycleId = job.input_ref?.reviewCycleId;
  if (!reviewCycleId) throw new Error("Missing reviewCycleId for reconciliation job");
  if (!job.paper_id) throw new Error("Reconciliation job requires a paper_id");

  // Defence in depth: confirm the cycle actually belongs to this job's
  // paper/org before reading its comments.
  const { data: cycle, error: cycleErr } = await adminClient
    .from("paper_review_cycles").select("id").eq("id", reviewCycleId)
    .eq("paper_id", job.paper_id).eq("org_id", job.org_id).single();
  if (cycleErr || !cycle) throw new Error("This review cycle couldn't be found for this paper. Try refreshing the page and analyzing again.");

  const { data: reviews, error: reviewsErr } = await adminClient
    .from("paper_reviews").select("id, reviewer_email, reviewer_name")
    .eq("paper_id", job.paper_id).eq("review_cycle_id", reviewCycleId);
  if (reviewsErr) throw new Error("Couldn't load reviews for this cycle — please try again in a moment.");
  const reviewIds = (reviews || []).map(r => r.id);
  if (!reviewIds.length) throw new Error("No practitioner reviews have been submitted for this review cycle yet — there's nothing to analyze until at least one reviewer submits.");

  const { data: comments, error: commentsErr } = await adminClient
    .from("paper_review_comments").select("*").in("review_id", reviewIds)
    .order("created_at", { ascending: true });
  if (commentsErr) throw new Error("Couldn't load comments for this cycle — please try again in a moment.");
  if (!comments || !comments.length) throw new Error("The submitted review(s) for this cycle don't include any comments — there's nothing to analyze. Ask reviewers to leave section comments, not just an overall recommendation.");

  const { data: draft } = await adminClient
    .from("paper_drafts").select("html_content, narrative_content").eq("paper_id", job.paper_id)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  await adminClient.from("ai_jobs").update({ stage: 2, pct: 40 }).eq("id", jobId);

  // narrative_content (the unified template's AI-editable prose) takes
  // priority; html_content is only present on legacy/pre-unification drafts.
  const narrativeText = draft?.narrative_content
    ? NARRATIVE_FIELDS.map(k => draft.narrative_content[k] ? `${k.toUpperCase()}: ${draft.narrative_content[k]}` : "").filter(Boolean).join("\n\n")
    : "";
  const draftContextText = narrativeText || stripHtmlToText(draft?.html_content).slice(0, 4000) || "(no draft content yet)";

  const reviewerById = Object.fromEntries((reviews || []).map(r => [r.id, r.reviewer_name || r.reviewer_email]));
  const contextLines = [
    `Current draft content (for context):`,
    draftContextText,
    "",
    `Comments (${comments.length}):`,
    ...comments.map((c, i) =>
      `${i + 1}. id=${c.id} | section=${c.section_key || "General"} | reviewer=${reviewerById[c.review_id] || "?"} | ` +
      `practitioner_importance=${c.importance} | text: ${c.comment_text}`),
  ];

  const parsed = await callClaudeForJson(
    anthropicKey, reconciliationSystemPrompt(), contextLines.join("\n"), 4000, "the comment reconciliation"
  );
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const itemsByCommentId = Object.fromEntries(items.map(it => [it.comment_id, it]));

  await adminClient.from("ai_jobs").update({ stage: 3, pct: 70 }).eq("id", jobId);

  const counts = { duplicate: 0, conflicting: 0, actionable: 0, out_of_scope: 0 };
  const commentIds = new Set(comments.map(c => c.id));
  const rows = comments.map(c => {
    const it = itemsByCommentId[c.id] || {};
    const category = RECONCILE_CATEGORIES.includes(it.category) ? it.category : "actionable";
    counts[category]++;
    return {
      comment_id: c.id,
      org_id: job.org_id,
      ai_category: category,
      duplicate_of_comment_id: (category === "duplicate" && commentIds.has(it.duplicate_of) && it.duplicate_of !== c.id) ? it.duplicate_of : null,
      conflicts_with_comment_id: (category === "conflicting" && commentIds.has(it.conflicts_with) && it.conflicts_with !== c.id) ? it.conflicts_with : null,
      ai_importance: RECONCILE_IMPORTANCE.includes(it.importance) ? it.importance : null,
      ai_affected_section: RECONCILE_SECTIONS.includes(it.affected_section) ? it.affected_section : (c.section_key || "General"),
      ai_recommended_action: RECONCILE_ACTIONS.includes(it.recommended_action) ? it.recommended_action : null,
      ai_recommendation: typeof it.recommendation === "string" ? it.recommendation : null,
    };
  });

  const { data: reconciliation, error: reconErr } = await adminClient
    .from("comment_reconciliations")
    .insert({
      paper_id: job.paper_id, org_id: job.org_id, review_cycle_id: reviewCycleId, ai_job_id: jobId,
      summary: {
        duplicate_count: counts.duplicate, conflicting_count: counts.conflicting,
        actionable_count: counts.actionable, out_of_scope_count: counts.out_of_scope,
      },
    })
    .select().single();
  if (reconErr) throw new Error(`Failed to create reconciliation: ${reconErr.message}`);

  const { error: mapErr } = await adminClient
    .from("comment_change_map")
    .insert(rows.map(r => ({ ...r, reconciliation_id: reconciliation.id })));
  if (mapErr) throw new Error(`Failed to create change map: ${mapErr.message}`);

  await adminClient.from("ai_jobs").update({
    status: "done", stage: 3, pct: 100,
    model: ANTHROPIC_MODEL, prompt_version: PROMPT_VERSION_RECONCILE,
    output_ref: { reconciliationId: reconciliation.id },
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);

  return { success: true, reconciliationId: reconciliation.id };
}

function reconciliationApplySystemPrompt() {
  return `You are revising the NARRATIVE sections of a nutraceutical evidence-synthesis research ` +
    `paper draft for the NEP Platform, incorporating a specific list of ACCEPTED practitioner ` +
    `feedback. You will be given the current narrative content as a JSON object with four keys — ` +
    `"introduction", "discussion" (Evidence Strength/Consistency interpretation), "bioavailability" ` +
    `(Bioavailability/Formulation considerations — both "discussion" and "bioavailability" are ` +
    `subsections of the paper's overall Discussion section) and "conclusions" — plus a list of ` +
    `accepted change instructions, each tagged with which section it affects.

Only apply changes tagged "Introduction", "Discussion", or "Conclusions" — those map to the four ` +
    `fields above (a "Discussion"-tagged change may require editing "discussion", "bioavailability", ` +
    `or both, whichever subsection it actually concerns). If a change is tagged "Abstract", ` +
    `"Methods", "Results", or "General", leave all four fields exactly as given; that change affects ` +
    `computed data or a section you don't control, not narrative prose, and must be handled elsewhere.

Preserve everything else in a field unchanged except what a change instruction requires. Never ` +
    `invent, alter, or contradict a specific number, effect size, or statistic — if a change asks ` +
    `you to correct a number, do not comply; leave the field unchanged (numbers are corrected by ` +
    `fixing the underlying data, not by editing prose).

Return ONLY a JSON object with exactly the keys "introduction", "discussion", "bioavailability", ` +
    `"conclusions" — each the full revised (or unchanged) text of that field, flowing academic ` +
    `prose, no headings, no markdown, no commentary outside the JSON object.`;
}

async function handleReconciliationApply(adminClient, anthropicKey, job, jobId) {
  const reconciliationId = job.input_ref?.reconciliationId;
  if (!reconciliationId) throw new Error("Missing reconciliationId for reconciliation_apply job");
  if (!job.paper_id) throw new Error("Reconciliation apply job requires a paper_id");

  const { data: reconciliation, error: reconErr } = await adminClient
    .from("comment_reconciliations").select("*").eq("id", reconciliationId)
    .eq("paper_id", job.paper_id).eq("org_id", job.org_id).single();
  if (reconErr || !reconciliation) throw new Error("This reconciliation analysis couldn't be found. Try running Analyze Feedback again.");

  const { data: accepted, error: acceptedErr } = await adminClient
    .from("comment_change_map")
    .select("*, paper_review_comments!comment_change_map_comment_id_fkey(section_key, comment_text)")
    .eq("reconciliation_id", reconciliationId).eq("researcher_decision", "accepted");
  if (acceptedErr) throw new Error("Couldn't load the accepted recommendations — please try again in a moment.");
  if (!accepted || !accepted.length) throw new Error("Accept at least one recommendation before generating the next draft.");

  const { data: draft, error: draftFetchErr } = await adminClient
    .from("paper_drafts").select("*").eq("paper_id", job.paper_id)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (draftFetchErr || !draft) throw new Error("No existing draft was found to revise for this paper.");

  await adminClient.from("ai_jobs").update({ stage: 2, pct: 40 }).eq("id", jobId);

  // Section-gate: only feedback whose affected section is AI-editable
  // narrative gets applied here. Anything targeting Abstract/Methods/Results/
  // General is accepted-but-not-yet-implemented — it requires correcting the
  // underlying outcome/study data, not an AI prose edit, so it must not be
  // marked implemented_in_draft_id (which would falsely claim it was applied).
  const narrativeAccepted = accepted.filter(a => {
    const section = a.ai_affected_section || a.paper_review_comments?.section_key || "General";
    return NARRATIVE_EDITABLE_SECTIONS.includes(section);
  });
  if (!narrativeAccepted.length) {
    throw new Error(
      "The accepted recommendation(s) only affect Abstract/Methods/Results content, which is " +
      "generated from your study data, not AI prose — there's nothing for AI to apply. Correct " +
      "the underlying outcome/study data instead, then the numbers will update automatically."
    );
  }

  const currentNarrative = draft.narrative_content || {};
  const changeLines = narrativeAccepted.map((a, i) =>
    `${i + 1}. [${a.ai_affected_section || a.paper_review_comments?.section_key || "General"}] ` +
    `${a.paper_review_comments?.comment_text} — action: ${a.ai_recommended_action || "implement"}` +
    `${a.ai_recommendation ? ` (${a.ai_recommendation})` : ""}`);
  const userContent =
    `Current narrative content (JSON):\n${JSON.stringify({
      introduction: currentNarrative.introduction || "", discussion: currentNarrative.discussion || "",
      conclusions: currentNarrative.conclusions || "",
    })}\n\nAccepted feedback to incorporate:\n${changeLines.join("\n")}`;

  const revisedNarrative = await callClaudeForJson(
    anthropicKey, reconciliationApplySystemPrompt(), userContent, 4000, "the revised narrative"
  );
  const narrativeContent = {};
  for (const key of NARRATIVE_FIELDS) {
    narrativeContent[key] = typeof revisedNarrative[key] === "string" ? revisedNarrative[key] : (currentNarrative[key] || "");
  }

  await adminClient.from("ai_jobs").update({ stage: 3, pct: 70 }).eq("id", jobId);

  const { data: maxRow } = await adminClient
    .from("paper_versions").select("version_number")
    .eq("paper_id", job.paper_id).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const nextVersionNumber = (maxRow?.version_number || 0) + 1;

  const { data: newDraft, error: newDraftErr } = await adminClient
    .from("paper_drafts")
    .insert({
      paper_id: job.paper_id, org_id: job.org_id,
      source_version_id: draft.source_version_id, source_version_number: draft.source_version_number,
      next_version_number: nextVersionNumber,
      narrative_content: narrativeContent, title: draft.title, compound: draft.compound,
      notes: `Generated from AI comment reconciliation (${narrativeAccepted.length} of ${accepted.length} accepted item(s) applied — the rest require underlying data corrections)`,
      metadata: draft.metadata || {},
      source: "reconciliation", ai_job_id: jobId, created_by: job.created_by,
      based_on_draft_id: draft.id,
      // preface_id intentionally left null here — backfilled below, exactly
      // once, from the freshly regenerated preface (migration 022's
      // "may be filled in exactly once from null" invariant), rather than
      // carrying forward the OLD draft's preface_id (which the guard trigger
      // would then forbid ever correcting to the new one).
    })
    .select().single();
  if (newDraftErr) throw new Error(`Failed to create revised draft: ${newDraftErr.message}`);

  const narrativeAcceptedIds = narrativeAccepted.map(a => a.id);
  const { error: updateMapErr } = await adminClient
    .from("comment_change_map").update({ implemented_in_draft_id: newDraft.id }).in("id", narrativeAcceptedIds);
  if (updateMapErr) throw new Error(`Draft created but failed to update traceability: ${updateMapErr.message}`);

  await adminClient.from("comment_reconciliations").update({ applied_draft_id: newDraft.id }).eq("id", reconciliationId);

  // Feature #3: "regenerate preface whenever major revisions happen" — a
  // draft produced from accepted reconciliation feedback is the clearest
  // such event in this system, so it's triggered automatically here rather
  // than left as a manual-only action. Best-effort: a failure here must not
  // fail the reconciliation-apply job, since the new draft already
  // succeeded and is the primary deliverable.
  let prefaceId = null;
  try {
    const { data: paperRow } = await adminClient
      .from("papers").select("project_id").eq("id", job.paper_id).single();
    if (paperRow?.project_id) {
      const { data: prefaceJob, error: prefaceJobErr } = await adminClient
        .from("ai_jobs")
        .insert({
          org_id: job.org_id, project_id: paperRow.project_id, paper_id: job.paper_id,
          job_type: "preface", status: "running", stage: 1, pct: 10,
          input_ref: { paperId: job.paper_id, triggeredBy: "reconciliation_apply", triggeringJobId: jobId },
          created_by: job.created_by,
        })
        .select().single();
      if (prefaceJobErr) throw new Error(prefaceJobErr.message);
      const prefaceResult = await handlePreface(adminClient, anthropicKey, prefaceJob, prefaceJob.id);
      prefaceId = prefaceResult.prefaceId;
      if (prefaceId) {
        await adminClient.from("paper_drafts").update({ preface_id: prefaceId }).eq("id", newDraft.id);
      }
    }
  } catch (e) {
    console.error("[ai-generate] auto preface regeneration after reconciliation failed", e);
  }

  await adminClient.from("ai_jobs").update({
    status: "done", stage: 3, pct: 100,
    model: ANTHROPIC_MODEL, prompt_version: PROMPT_VERSION_RECONCILE_APPLY,
    output_ref: { draftId: newDraft.id, prefaceId },
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);

  return { success: true, draftId: newDraft.id, paperId: job.paper_id, prefaceId };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let jobId;
  try {
    ({ jobId } = await req.json());
    if (!jobId) throw new Error("Missing required field: jobId");

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("AI generation isn't configured on this platform yet — contact your administrator (ANTHROPIC_API_KEY secret is missing).");

    // Load the job — it was created by the caller's own authenticated,
    // RLS-scoped session, so org_id/project_id here are already trustworthy.
    // We don't accept those values fresh from the request body.
    const { data: job, error: jobErr } = await adminClient
      .from("ai_jobs").select("*").eq("id", jobId).single();
    if (jobErr || !job) throw new Error("Job not found");
    if (!["draft_sections", "preface", "reconciliation", "reconciliation_apply"].includes(job.job_type))
      throw new Error(`Unsupported job_type: ${job.job_type}`);

    await adminClient.from("ai_jobs").update({ status: "running", stage: 1, pct: 10 }).eq("id", jobId);

    if (job.job_type === "preface") {
      const result = await handlePreface(adminClient, anthropicKey, job, jobId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (job.job_type === "reconciliation") {
      const result = await handleReconciliation(adminClient, anthropicKey, job, jobId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (job.job_type === "reconciliation_apply") {
      const result = await handleReconciliationApply(adminClient, anthropicKey, job, jobId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // job_type === "draft_sections": generate ONLY the AI-editable narrative
    // (introduction/discussion/conclusions), grounded in the client's already-
    // computed WS/ESS metrics. This does not touch papers/paper_drafts at all
    // — buildDocxBlob (src/App.jsx) is the one place a draft's computed
    // Abstract/Results/Methods content and file bytes get assembled and
    // persisted; this job just supplies the narrative prose it drops in.
    //
    // Defence in depth: confirm the project actually belongs to this job's
    // org before reading anything from it — closes off a service-role read
    // of arbitrary org data via a tampered project_id.
    const { data: project, error: projErr } = await adminClient
      .from("projects").select("*").eq("id", job.project_id).eq("org_id", job.org_id).single();
    if (projErr || !project) throw new Error("Project not found for this job's organisation");

    const [{ data: compound }, { data: outcomes }, { data: refs }] = await Promise.all([
      adminClient.from("compounds").select("*").eq("project_id", job.project_id).maybeSingle(),
      adminClient.from("study_outcomes").select("*").eq("project_id", job.project_id),
      adminClient.from("study_references").select("*").eq("project_id", job.project_id),
    ]);

    const contextText = buildContext(project, compound, outcomes || [], refs || [], job.input_ref?.metrics);

    await adminClient.from("ai_jobs").update({ stage: 2, pct: 40 }).eq("id", jobId);

    const parsed = await callClaudeForJson(anthropicKey, narrativeSystemPrompt(), contextText, 4000, "the draft narrative");
    const narrativeContent = {};
    for (const key of NARRATIVE_FIELDS) narrativeContent[key] = typeof parsed[key] === "string" ? parsed[key] : "";

    await adminClient.from("ai_jobs").update({
      status: "done", stage: 3, pct: 100,
      model: ANTHROPIC_MODEL, prompt_version: PROMPT_VERSION_DRAFT,
      output_ref: { paperId: job.paper_id || null, narrativeContent },
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response(
      JSON.stringify({ success: true, paperId: job.paper_id || null, narrativeContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[ai-generate]", e);
    if (jobId) {
      await adminClient.from("ai_jobs").update({
        status: "error", error_message: (e as Error).message, completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
