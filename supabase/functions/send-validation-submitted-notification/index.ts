// NEP Platform — Post-Publication Validation Submitted Confirmation
// Sends the practitioner themselves a copy of what they just submitted
// (feature #10: "Send practitioners: Final submitted feedback copy through
// email") — distinct from send-review-submitted-notification, which
// notifies the RESEARCHER instead.
// Deploy: supabase functions deploy send-validation-submitted-notification
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
    const { validationId, platformUrl } = await req.json();
    if (!validationId) throw new Error("Missing required field: validationId");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");
    const fromAddress = Deno.env.get("EMAIL_FROM") || "NEP Platform <noreply@nep.science>";
    const url = platformUrl || "https://nep.science";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: validation, error: vErr } = await adminClient
      .from("post_publication_validations")
      .select("*, papers(title, compound, org_id)")
      .eq("id", validationId).single();
    if (vErr || !validation) throw new Error("Validation not found");
    if (validation.status !== "submitted") throw new Error(`Validation has not been submitted yet (status: ${validation.status})`);

    const field = (label, value) => value ? `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${label}</div>
        <div style="color:#DCE6F5;font-size:13px;line-height:1.6">${value}</div>
      </div>` : "";

    const html = renderEmailShell({
      heading: "Your validation has been recorded",
      greeting: `Hi ${validation.practitioner_name || "there"},`,
      bodyHtml: `
        <p style="margin:0 0 20px;color:#C8D8EF;font-size:13px;line-height:1.6">
          Thank you for validating <strong style="color:#F0F6FF">${validation.papers?.title || "this paper"}</strong>.
          Here is a copy of what you submitted, for your records.
        </p>
        ${field("Finding validation", validation.finding_validation)}
        ${field("Practical applicability", validation.practical_applicability)}
        ${field("Recommendations", validation.recommendations)}
        ${field("Future research suggestions", validation.future_research_suggestions)}`,
      platformUrl: url,
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: validation.practitioner_email,
        subject: `Your validation of "${validation.papers?.title || "a paper"}" — submitted copy`,
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    await adminClient.from("notifications").insert({
      org_id: validation.org_id || validation.papers?.org_id || null,
      type: "validation_submitted",
      recipient_email: validation.practitioner_email,
      related_entity_type: "post_publication_validation",
      related_entity_id: validationId,
      subject: `Your validation of "${validation.papers?.title || "a paper"}" — submitted copy`,
      provider_message_id: resendData.id || null,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-validation-submitted-notification]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
