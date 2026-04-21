// NEP Platform — Doctor Invitation Edge Function
// Deploy: supabase functions deploy send-invite
//
// Supabase secrets required (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY  — from resend.com
//   EMAIL_FROM      — e.g. "NEP Platform <noreply@yourdomain.com>"
//
// Auto-injected by Supabase (no manual secret needed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// @ts-nocheck — Deno runtime; VS Code TS errors are expected and harmless

import { serve }         from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const {
      doctorEmail, doctorName,
      studyTitle, compoundName, duration,
      platformUrl, studyId,
      researcherEmail, researcherName,
      orgId, createdBy,
    } = await req.json();

    // ── Validate required fields ──────────────────────────────────────────
    if (!doctorEmail || !studyId || !platformUrl)
      throw new Error("Missing required fields: doctorEmail, studyId, platformUrl");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");

    const fromAddress = Deno.env.get("EMAIL_FROM") || "NEP Platform <noreply@nep.science>";

    // ── Generate a cryptographically secure token ─────────────────────────
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join(""); // 64-char hex

    // ── Persist token on the existing study_invitations row (service role) ───
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: upsertErr } = await adminClient
      .from("study_invitations")
      .upsert({
        study_id:          studyId,
        doctor_email:      doctorEmail.toLowerCase(),
        doctor_name:       doctorName || doctorEmail.split("@")[0],
        org_id:            orgId || null,
        token,
        token_expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invite_status:     "pending",
        last_sent_at:      new Date().toISOString(),
      }, { onConflict: "study_id,doctor_email" });

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

    // ── Build tokenised invite URL ────────────────────────────────────────
    const inviteUrl = `${platformUrl}?token=${token}`;

    // ── Build HTML email ──────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:580px;margin:40px auto;background:#0B1120;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3)">

    <!-- Header -->
    <div style="padding:28px 32px;border-bottom:1px solid #1E2F4A;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;background:#00D4AA;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#0B1120;flex-shrink:0;text-align:center;line-height:40px">N</div>
      <div>
        <div style="color:#F0F6FF;font-size:16px;font-weight:700">NEP Platform</div>
        <div style="color:#4A6080;font-size:11px">Nutraceutical Evidence Platform</div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <h2 style="margin:0 0 8px;color:#F0F6FF;font-size:20px;font-weight:700">
        You've been invited to a clinical study
      </h2>
      <p style="margin:0 0 20px;color:#7A94B8;font-size:14px">Hi ${doctorName || "Doctor"},</p>

      <!-- Researcher card -->
      <div style="background:#0F1A2E;border-radius:8px;padding:14px 18px;margin-bottom:20px;border-left:3px solid #00D4AA">
        <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Invitation from</div>
        <div style="color:#F0F6FF;font-size:13px;font-weight:600">${researcherName || "A researcher"}</div>
        <div style="color:#5A7A9A;font-size:12px;margin-top:2px">${researcherEmail || ""}</div>
      </div>

      <!-- Study card -->
      <div style="background:#131F32;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #1E2F4A">
        <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Study Details</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="color:#4A6080;font-size:12px;padding:4px 0;width:90px">Study</td>
            <td style="color:#F0F6FF;font-size:13px;font-weight:600">${studyTitle}</td>
          </tr>
          <tr>
            <td style="color:#4A6080;font-size:12px;padding:4px 0">Compound</td>
            <td style="color:#C8D8EF;font-size:13px">${compoundName || "—"}</td>
          </tr>
          <tr>
            <td style="color:#4A6080;font-size:12px;padding:4px 0">Duration</td>
            <td style="color:#C8D8EF;font-size:13px">${duration || "—"}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 24px;color:#C8D8EF;font-size:13px;line-height:1.6">
        Click the button below to access your Doctor Dashboard.
        You will sign in with this email address using a one-time password (OTP) —
        no password required.
      </p>

      <!-- CTA button -->
      <a href="${inviteUrl}"
         style="display:inline-block;background:#00D4AA;color:#0B1120;font-weight:700;
                font-size:14px;padding:14px 32px;border-radius:8px;text-decoration:none;
                margin-bottom:24px">
        Open Doctor Dashboard →
      </a>

      <!-- Link expiry notice -->
      <div style="background:#131F32;border-radius:6px;padding:14px;border:1px solid #1E2F4A;margin-bottom:16px">
        <div style="color:#4A6080;font-size:12px">
          Sign in with <strong style="color:#7A94B8">${doctorEmail}</strong> when prompted.
          This invite link expires in <strong style="color:#C8D8EF">7 days</strong>.
        </div>
      </div>

      <!-- Plain-text fallback link -->
      <div style="background:#0A1020;border-radius:6px;padding:12px;border:1px solid #1A2535;margin-bottom:24px">
        <div style="color:#4A6080;font-size:10px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Or copy this link</div>
        <div style="color:#5A9ACA;font-size:11px;word-break:break-all">${inviteUrl}</div>
      </div>

      <p style="margin:0;color:#4A6080;font-size:11px">
        Questions? Reply to this email and you'll reach ${researcherName || "the researcher"} directly.<br><br>
        Thank you,<br>NEP Research Team
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#060D1A;border-top:1px solid #1E2F4A;text-align:center">
      <div style="color:#2A3A50;font-size:10px">
        NEP Platform · Nutraceutical Evidence Platform ·
        <a href="${platformUrl}" style="color:#2A3A50">${platformUrl}</a>
      </div>
    </div>

  </div>
</body>
</html>`;

    // ── Send via Resend ───────────────────────────────────────────────────
    const emailPayload: Record<string, unknown> = {
      from:    fromAddress,
      to:      doctorEmail,
      subject: `${researcherName || "A researcher"} invited you to: ${studyTitle}`,
      html,
    };
    if (researcherEmail) emailPayload.reply_to = researcherEmail;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body:    JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id, token }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("[send-invite]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
