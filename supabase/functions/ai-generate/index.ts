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

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514"; // matches api/claude.js
const PROMPT_VERSION_DRAFT = "draft-sections-v1";
const PROMPT_VERSION_PREFACE = "preface-v1";

// Sections the brief explicitly forbids at draft stage — they depend on
// outcome analysis that hasn't happened yet. Enforced by the prompt AND by
// stripping any matching heading the model produces anyway.
const DISALLOWED_SECTIONS = ["results", "analysis", "discussion", "conclusion", "conclusions"];
const DEFAULT_SECTIONS = ["Title", "Keywords", "Abstract", "Introduction", "Methods"];

const PREFACE_FIELDS = [
  "overview", "problem_statement", "motivation", "objectives",
  "scope", "methodology", "expected_contributions", "reviewer_guidance",
];

function buildContext(project, compound, outcomes, refs) {
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
  return lines.join("\n");
}

function systemPrompt(sections) {
  return `You are an expert medical writer drafting sections of a nutraceutical clinical ` +
    `evidence-synthesis research paper in IMRaD style for the NEP Platform (Nutraceutical ` +
    `Evidence Platform). You will be given structured data about a compound, its study ` +
    `outcomes, and its references.

Produce ONLY these sections, in this order: ${sections.join(", ")}.

Do NOT write Results, Data Analysis, Discussion, or Conclusions under any circumstance — ` +
    `those sections depend on outcome analysis that has not been finalised yet, and you have ` +
    `no analysis to draw on. If you are unsure whether something belongs in Methods vs ` +
    `Results, leave it out.

Output clean semantic HTML only: <h1> for the paper title, <h2> for each major section ` +
    `heading, <p> for paragraphs, <ul>/<li> for lists where useful. Do not include <html>, ` +
    `<head>, or <body> tags, markdown formatting, or any commentary outside the HTML. Do not ` +
    `fabricate specific numeric results, effect sizes, or citations beyond what is given below.`;
}

// Defensive net: drop any heading (and its following content, up to the next
// heading of equal-or-higher level) whose text matches a disallowed section,
// in case the model ignores the system prompt.
function stripDisallowedSections(html) {
  const parts = html.split(/(?=<h[1-3][^>]*>)/i);
  const kept = [];
  const stripped = [];
  for (const part of parts) {
    const headingMatch = part.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
    const headingText = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase() : "";
    const isDisallowed = headingText && DISALLOWED_SECTIONS.some(d => headingText.includes(d));
    if (isDisallowed) stripped.push(headingMatch[1]);
    else kept.push(part);
  }
  return { cleaned: kept.join(""), stripped };
}

async function callClaude(anthropicKey, sections, contextText, strict) {
  const messages = [{
    role: "user",
    content: strict
      ? `${contextText}\n\nReminder: absolutely no Results, Analysis, Discussion, or ` +
        `Conclusions sections — only ${sections.join(", ")}.`
      : contextText,
  }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": anthropicKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: systemPrompt(sections),
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Anthropic API error");
  return (data.content || []).map(b => b.text || "").join("\n").trim();
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

async function callClaudeForPreface(anthropicKey, contextText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": anthropicKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: prefaceSystemPrompt(),
      messages: [{ role: "user", content: contextText }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Anthropic API error");
  const raw = (data.content || []).map(b => b.text || "").join("\n").trim();

  // Models sometimes wrap JSON in a code fence despite instructions not to —
  // strip it defensively before parsing.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) { throw new Error("AI did not return valid JSON for the preface"); }

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
  const contextText = buildContext(project, compound, outcomes || [], refs || []);

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
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured in Edge Function secrets");

    // Load the job — it was created by the caller's own authenticated,
    // RLS-scoped session, so org_id/project_id here are already trustworthy.
    // We don't accept those values fresh from the request body.
    const { data: job, error: jobErr } = await adminClient
      .from("ai_jobs").select("*").eq("id", jobId).single();
    if (jobErr || !job) throw new Error("Job not found");
    if (!["draft_sections", "preface"].includes(job.job_type))
      throw new Error(`Unsupported job_type: ${job.job_type}`);

    await adminClient.from("ai_jobs").update({ status: "running", stage: 1, pct: 10 }).eq("id", jobId);

    if (job.job_type === "preface") {
      const result = await handlePreface(adminClient, anthropicKey, job, jobId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    const sections = (job.input_ref?.sections?.length ? job.input_ref.sections : DEFAULT_SECTIONS);
    const contextText = buildContext(project, compound, outcomes || [], refs || []);

    await adminClient.from("ai_jobs").update({ stage: 2, pct: 40 }).eq("id", jobId);

    let html = await callClaude(anthropicKey, sections, contextText, false);
    let { cleaned, stripped } = stripDisallowedSections(html);
    if (stripped.length) {
      // One retry with a stronger reminder before falling back to the
      // stripped result — mirrors the brief's "reject/retry" requirement
      // without an unbounded loop.
      html = await callClaude(anthropicKey, sections, contextText, true);
      ({ cleaned, stripped } = stripDisallowedSections(html));
    }

    await adminClient.from("ai_jobs").update({ stage: 3, pct: 70 }).eq("id", jobId);

    // Extract a title from the first <h1> for the papers/paper_drafts title field.
    const titleMatch = cleaned.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "") ||
      project.paper_title || `${compound?.compound_name || "Untitled"} Evidence Synthesis`;
    const compoundName = compound?.compound_name || "";

    let paperId = job.paper_id;
    let sourceVersionId = null;
    let sourceVersionNumber = null;
    let nextVersionNumber = 1;

    if (paperId) {
      const { data: currentVersion } = await adminClient
        .from("paper_versions").select("id, version_number")
        .eq("paper_id", paperId).eq("is_current", true).maybeSingle();
      if (currentVersion) {
        sourceVersionId = currentVersion.id;
        sourceVersionNumber = currentVersion.version_number;
      }
      const { data: maxRow } = await adminClient
        .from("paper_versions").select("version_number")
        .eq("paper_id", paperId).order("version_number", { ascending: false }).limit(1).maybeSingle();
      nextVersionNumber = (maxRow?.version_number || 0) + 1;
    } else {
      const { data: newPaper, error: paperErr } = await adminClient
        .from("papers")
        .insert({ org_id: job.org_id, project_id: job.project_id, title, compound: compoundName, current_version: 0, created_by: job.created_by })
        .select().single();
      if (paperErr) throw new Error(`Failed to create paper: ${paperErr.message}`);
      paperId = newPaper.id;
    }

    const { data: draft, error: draftErr } = await adminClient
      .from("paper_drafts")
      .insert({
        paper_id: paperId,
        org_id: job.org_id,
        source_version_id: sourceVersionId,
        source_version_number: sourceVersionNumber,
        next_version_number: nextVersionNumber,
        html_content: cleaned,
        title,
        compound: compoundName,
        notes: "Generated by AI draft assistant" + (stripped.length ? ` (removed ${stripped.length} disallowed section(s): ${stripped.join(", ")})` : ""),
        metadata: { sections },
        source: "ai_draft",
        ai_job_id: jobId,
        created_by: job.created_by,
      })
      .select().single();
    if (draftErr) throw new Error(`Failed to create draft: ${draftErr.message}`);

    await adminClient.from("ai_jobs").update({
      status: "done", stage: 3, pct: 100,
      model: ANTHROPIC_MODEL, prompt_version: PROMPT_VERSION_DRAFT,
      output_ref: { paperId, draftId: draft.id },
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response(
      JSON.stringify({ success: true, paperId, draftId: draft.id }),
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
