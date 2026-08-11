// NEP Platform — Review Submitted Notification Edge Function
// Sent to the inviting researcher every time a practitioner submits a
// review (feature #8) — repeats for every review cycle since it's keyed
// off the review row, not a one-time flag.
// Deploy: supabase functions deploy send-review-submitted-notification
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
    const { reviewId, platformUrl } = await req.json();
    if (!reviewId) throw new Error("Missing required field: reviewId");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");
    const fromAddress = Deno.env.get("EMAIL_FROM") || "NEP Platform <noreply@nep.science>";
    const url = platformUrl || "https://nep.science";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Load everything ourselves — the email always reflects what was
    // actually submitted and stored, never client-supplied content.
    const { data: review, error: revErr } = await adminClient
      .from("paper_reviews")
      .select("id, paper_id, invitation_id, reviewer_email, reviewer_name, iteration, overall_comments, recommendation, status")
      .eq("id", reviewId).single();
    if (revErr || !review) throw new Error("Review not found");
    if (review.status !== "submitted") throw new Error(`Review has not been submitted yet (status: ${review.status})`);

    const [{ data: paper }, { data: comments }] = await Promise.all([
      adminClient.from("papers").select("id, title, compound, org_id").eq("id", review.paper_id).single(),
      adminClient.from("paper_review_comments").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
    ]);
    if (!paper) throw new Error("Paper not found");

    let researcherEmail = null, researcherName = null;
    if (review.invitation_id) {
      const { data: invitation } = await adminClient
        .from("paper_review_invitations").select("invited_by_user_id").eq("id", review.invitation_id).single();
      if (invitation?.invited_by_user_id) {
        const { data: researcher } = await adminClient
          .from("users").select("email, full_name").eq("id", invitation.invited_by_user_id).single();
        researcherEmail = researcher?.email || null;
        researcherName = researcher?.full_name || null;
      }
    }
    if (!researcherEmail) throw new Error("No researcher on file to notify for this invitation");

    const reviewerLabel = review.reviewer_name || review.reviewer_email;
    const commentsHtml = (comments || []).length
      ? (comments || []).map(c => `
          <div style="padding:10px 0;border-top:1px solid #1E2F4A">
            <div style="color:#5A7A9A;font-size:11px;margin-bottom:4px">${c.section_key || "General"} · ${c.importance}</div>
            <div style="color:#DCE6F5;font-size:13px">${c.comment_text}</div>
          </div>`).join("")
      : `<p style="margin:0;color:#5A7A9A;font-size:12px">No section-level comments were left.</p>`;

    const html = renderEmailShell({
      heading: "A practitioner submitted their review",
      greeting: `Hi ${researcherName || "there"},`,
      bodyHtml: `
        <div style="background:#131F32;border-radius:8px;padding:20px;margin-bottom:20px;border:1px solid #1E2F4A">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Paper</div>
          <div style="color:#F0F6FF;font-size:13px;font-weight:600">${paper.title || "Untitled paper"}</div>
          <div style="color:#C8D8EF;font-size:12px;margin-top:4px">${paper.compound || ""} · review iteration ${review.iteration || 1}</div>
        </div>
        <p style="margin:0 0 8px;color:#C8D8EF;font-size:13px;line-height:1.6">
          <strong style="color:#F0F6FF">${reviewerLabel}</strong> recommended:
          <strong style="color:#00D4AA">${(review.recommendation || "").replace(/_/g, " ") || "no recommendation"}</strong>
        </p>
        ${review.overall_comments ? `
        <div style="background:#0F1A2E;border-radius:8px;padding:14px 18px;margin:12px 0 20px;border-left:3px solid #00D4AA">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Overall comments</div>
          <div style="color:#DCE6F5;font-size:13px;line-height:1.6">${review.overall_comments}</div>
        </div>` : ""}
        <div style="margin-bottom:20px">
          <div style="font-size:10px;color:#00D4AA;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Section comments (${(comments || []).length})</div>
          ${commentsHtml}
        </div>`,
      ctaLabel: "Open the paper →",
      ctaUrl: url,
      platformUrl: url,
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: researcherEmail,
        subject: `${reviewerLabel} reviewed: ${paper.title || "your paper"}`,
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error(resendData.message || resendData.name || "Resend API error");

    await adminClient.from("notifications").insert({
      org_id: paper.org_id,
      type: "review_submitted",
      recipient_email: researcherEmail,
      related_entity_type: "paper_review",
      related_entity_id: reviewId,
      subject: `${reviewerLabel} reviewed: ${paper.title || "your paper"}`,
      payload: {
        reviewer: reviewerLabel, recommendation: review.recommendation,
        comment_count: (comments || []).length, iteration: review.iteration || 1,
      },
      provider_message_id: resendData.id || null,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-review-submitted-notification]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
