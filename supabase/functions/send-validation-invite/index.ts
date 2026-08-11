// NEP Platform — Post-Publication Validation Invitation Edge Function
// Re-invites the same practitioners who reviewed earlier drafts, now that
// the paper has a final published version (feature #10).
// Deploy: supabase functions deploy send-validation-invite
//
// Supabase secrets required (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  — already configured for send-doctor-invite, reused here
//   EMAIL_FROM      — already configured for send-doctor-invite, reused here
//
// Auto-injected by Supabase (no manual secret needed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// @ts-nocheck — Deno runtime; VS Code TS errors are expected and harmless

import { serve }            from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }     from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }      from "../_shared/cors.ts";
import { renderEmailShell } from "../_shared/email-shell.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      paperId, practitionerEmail, practitionerName,
      platformUrl, researcherEmail, researcherName, orgId,
    } = await req.json();

    if (!paperId || !practitionerEmail || !platformUrl)
      throw new Error("Missing required fields: paperId, practitionerEmail, platformUrl");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");
    const fromAddress = Deno.env.get("EMAIL_FROM") || "NEP Platform <noreply@nep.science>";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: paper, error: paperErr } = await adminClient
      .from("papers").select("id, title, compound, org_id").eq("id", paperId).single();
    if (paperErr || !paper) throw new Error("Paper not found");

    const { data: finalVersion, error: verErr } = await adminClient
      .from("paper_versions").select("id, version_number").eq("paper_id", paperId).eq("is_current", true).single();
    if (verErr || !finalVersion) throw new Error("This paper has no published version yet — publish it before requesting validation");

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const validateUrl = `${platformUrl}?validate=${paperId}&token=${token}`;

    const html = renderEmailShell({
      heading: "Final published paper — your validation is requested",
      greeting: `Hi ${practitionerName || "there"},`,
      bodyHtml: `
        <div style="background:#131F32;border-radius:8px;padding:20px;margin-bottom:20px;border:1px solid #1E2F4A">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Paper</div>
          <div style="color:#F0F6FF;font-size:13px;font-weight:600">${paper.title || "Untitled paper"} (v${finalVersion.version_number})</div>
          <div style="color:#C8D8EF;font-size:12px;margin-top:4px">${paper.compound || ""}</div>
        </div>
        <p style="margin:0 0 24px;color:#C8D8EF;font-size:13px;line-height:1.6">
          Thank you for reviewing earlier drafts of this paper — it has now been finalized and
          published. We'd like your final validation: whether the findings hold up in practice,
          practical applicability, any recommendations, and ideas for future research.
          You'll see the final paper alongside a summary of what changed since your last review.
        </p>`,
      ctaLabel: "Open Final Validation →",
      ctaUrl: validateUrl,
      noteHtml: `Sign in with <strong style="color:#7A94B8">${practitionerEmail}</strong> when prompted.
        This link expires in <strong style="color:#C8D8EF">7 days</strong>.`,
      footerNote: `Questions? Reply to this email and you'll reach ${researcherName || "the researcher"} directly.<br><br>Thank you,<br>NEP Research Team`,
      platformUrl,
    });

    const emailPayload: Record<string, unknown> = {
      from: fromAddress,
      to: practitionerEmail,
      subject: `Final validation requested: ${paper.title || "a paper you reviewed"}`,
      html,
    };
    if (researcherEmail) emailPayload.reply_to = researcherEmail;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify(emailPayload),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    // Email confirmed sent — only now persist the invitation.
    const { error: upsertErr } = await adminClient
      .from("post_publication_validations")
      .upsert({
        paper_id: paperId,
        final_version_id: finalVersion.id,
        org_id: orgId || paper.org_id,
        practitioner_email: practitionerEmail.toLowerCase(),
        practitioner_name: practitionerName || practitionerEmail.split("@")[0],
        token,
        token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "invited",
        invited_at: new Date().toISOString(),
      }, { onConflict: "paper_id,practitioner_email,final_version_id" });
    if (upsertErr) throw new Error(`Email sent but failed to record invitation: ${upsertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-validation-invite]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
