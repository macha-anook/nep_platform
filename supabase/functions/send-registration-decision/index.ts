// NEP Platform — Researcher Registration Decision Edge Function
// Sent after an administrator approves or rejects a registration.
// Deploy: supabase functions deploy send-registration-decision
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

    // Service-role client: load the registration ourselves (including the
    // decision itself) rather than trust a client-supplied decision/reason.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: reg, error: fetchErr } = await adminClient
      .from("researcher_registrations")
      .select("id, email, full_name, status, rejection_reason")
      .eq("id", registrationId)
      .single();
    if (fetchErr || !reg) throw new Error("Registration not found");
    if (!["approved", "rejected"].includes(reg.status))
      throw new Error(`Registration has no final decision yet (status: ${reg.status})`);

    const isApproved = reg.status === "approved";
    const url = platformUrl || "https://nep.science";

    const html = renderEmailShell({
      heading: isApproved ? "Registration Approved" : "Registration Update",
      greeting: `Hi ${reg.full_name || "there"},`,
      bodyHtml: isApproved
        ? `<p style="margin:0 0 20px;color:#C8D8EF;font-size:13px;line-height:1.6">
             Good news — your researcher application for NEP Platform has been
             <strong style="color:#00D4AA">approved</strong>. Sign in with this email address
             to get started.
           </p>`
        : `<p style="margin:0 0 20px;color:#C8D8EF;font-size:13px;line-height:1.6">
             Your researcher application for NEP Platform was
             <strong style="color:#F0F6FF">not approved</strong> at this time.
             ${reg.rejection_reason ? `<br><br><em>${reg.rejection_reason}</em>` : ""}
           </p>`,
      ctaLabel: isApproved ? "Sign in to NEP Platform →" : undefined,
      ctaUrl: isApproved ? url : undefined,
      noteHtml: isApproved
        ? `Sign in with <strong style="color:#7A94B8">${reg.email}</strong> using a one-time
           email code or Google — no password required.`
        : undefined,
      platformUrl: url,
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: reg.email,
        subject: isApproved ? "NEP Platform — Registration Approved" : "NEP Platform — Registration Update",
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    await adminClient.from("notifications").insert({
      type: "registration_decision",
      recipient_email: reg.email,
      related_entity_type: "registration",
      related_entity_id: reg.id,
      subject: isApproved ? "NEP Platform — Registration Approved" : "NEP Platform — Registration Update",
      payload: { status: reg.status, rejection_reason: reg.rejection_reason || null },
      provider_message_id: resendData.id || null,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-registration-decision]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
