// NEP Platform — Practitioner Review Invitation Edge Function
// Clone of send-doctor-invite's token/email pattern, scoped to a paper
// instead of a clinical study.
// Deploy: supabase functions deploy send-review-invite
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
      platformUrl, researcherEmail, researcherName, orgId, invitedByUserId,
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

    // Load the paper ourselves — title in the email reflects what's actually
    // stored, not whatever the client happened to send.
    const { data: paper, error: paperErr } = await adminClient
      .from("papers").select("id, title, compound, org_id").eq("id", paperId).single();
    if (paperErr || !paper) throw new Error("Paper not found");

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Token is generated up front (needed for the email body below), but the
    // invitation is NOT written to the database yet — only once Resend
    // confirms the email actually sent. Otherwise a failed send (e.g. the
    // sandbox "verify a domain" restriction) would still leave a misleading
    // "pending" invitation stored with no email ever delivered.
    const reviewUrl = `${platformUrl}?paper=${paperId}&token=${token}`;

    const html = renderEmailShell({
      heading: "You've been invited to review a paper",
      greeting: `Hi ${practitionerName || "there"},`,
      bodyHtml: `
        <div style="background:#0F1A2E;border-radius:8px;padding:14px 18px;margin-bottom:20px;border-left:3px solid #00D4AA">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Invitation from</div>
          <div style="color:#F0F6FF;font-size:13px;font-weight:600">${researcherName || "A researcher"}</div>
          <div style="color:#5A7A9A;font-size:12px;margin-top:2px">${researcherEmail || ""}</div>
        </div>
        <div style="background:#131F32;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #1E2F4A">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Paper</div>
          <div style="color:#F0F6FF;font-size:13px;font-weight:600">${paper.title || "Untitled paper"}</div>
          <div style="color:#C8D8EF;font-size:12px;margin-top:4px">${paper.compound || ""}</div>
        </div>
        <p style="margin:0 0 24px;color:#C8D8EF;font-size:13px;line-height:1.6">
          Click the button below to read the paper and submit your review — section comments,
          overall feedback, and a recommendation. You will sign in with this email address
          using a one-time password (OTP) — no password required.
        </p>`,
      ctaLabel: "Open Review →",
      ctaUrl: reviewUrl,
      noteHtml: `Sign in with <strong style="color:#7A94B8">${practitionerEmail}</strong> when prompted.
        This invite link expires in <strong style="color:#C8D8EF">7 days</strong>.`,
      footerNote: `Questions? Reply to this email and you'll reach ${researcherName || "the researcher"} directly.<br><br>Thank you,<br>NEP Research Team`,
      platformUrl,
    });

    const emailPayload: Record<string, unknown> = {
      from: fromAddress,
      to: practitionerEmail,
      subject: `${researcherName || "A researcher"} invited you to review: ${paper.title || "a paper"}`,
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

    // Email confirmed sent — now, and only now, persist the invitation.
    const { error: upsertErr } = await adminClient
      .from("paper_review_invitations")
      .upsert({
        paper_id: paperId,
        org_id: orgId || paper.org_id,
        practitioner_email: practitionerEmail.toLowerCase(),
        practitioner_name: practitionerName || practitionerEmail.split("@")[0],
        token,
        token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invite_status: "pending",
        invited_by_user_id: invitedByUserId || null,
        last_sent_at: new Date().toISOString(),
      }, { onConflict: "paper_id,practitioner_email" });
    if (upsertErr) throw new Error(`Email sent but failed to record invitation: ${upsertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id, token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-review-invite]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
