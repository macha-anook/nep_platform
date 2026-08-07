// NEP Platform — Researcher Registration Acknowledgement Edge Function
// Sent immediately after a researcher submits their registration application.
// Deploy: supabase functions deploy send-registration-ack
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
import { corsHeaders }   from "../_shared/cors.ts";
import { renderEmailShell } from "../_shared/email-shell.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { registrationId, platformUrl } = await req.json();
    if (!registrationId) throw new Error("Missing required field: registrationId");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");
    const fromAddress = Deno.env.get("EMAIL_FROM") || "NEP Platform <noreply@nep.science>";

    // Service-role client: load the registration ourselves rather than trust
    // client-supplied name/email, so the email content always reflects the
    // actual stored application.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: reg, error: fetchErr } = await adminClient
      .from("researcher_registrations")
      .select("id, email, full_name")
      .eq("id", registrationId)
      .single();
    if (fetchErr || !reg) throw new Error("Registration not found");

    const html = renderEmailShell({
      heading: "Registration Received",
      greeting: `Hi ${reg.full_name || "there"},`,
      bodyHtml: `
        <p style="margin:0 0 20px;color:#C8D8EF;font-size:13px;line-height:1.6">
          Thanks for applying for researcher access to NEP Platform. Our team reviews every
          application by hand — you'll receive a decision by email within
          <strong style="color:#F0F6FF">2–3 business days</strong>.
        </p>`,
      noteHtml: `Application email: <strong style="color:#7A94B8">${reg.email}</strong>`,
      platformUrl: platformUrl || "https://nep.science",
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: reg.email,
        subject: "NEP Platform — Registration Received",
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    await adminClient.from("notifications").insert({
      type: "registration_ack",
      recipient_email: reg.email,
      related_entity_type: "registration",
      related_entity_id: reg.id,
      subject: "NEP Platform — Registration Received",
      provider_message_id: resendData.id || null,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-registration-ack]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
