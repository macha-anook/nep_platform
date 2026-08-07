// Shared HTML email shell for NEP Platform transactional emails.
// Extracted from the send-doctor-invite template so new emails (registration
// ack/decision, and later review/validation invites) share one visual system
// instead of re-copying the inline styles.
// @ts-nocheck — Deno runtime; VS Code TS errors are expected and harmless

export function renderEmailShell({
  heading,
  greeting,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  noteHtml,
  footerNote,
  platformUrl,
}: {
  heading: string;
  greeting?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  noteHtml?: string;
  footerNote?: string;
  platformUrl: string;
}): string {
  return `<!DOCTYPE html>
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
      <h2 style="margin:0 0 8px;color:#F0F6FF;font-size:20px;font-weight:700">${heading}</h2>
      ${greeting ? `<p style="margin:0 0 20px;color:#7A94B8;font-size:14px">${greeting}</p>` : ""}

      ${bodyHtml}

      ${ctaLabel && ctaUrl ? `
      <a href="${ctaUrl}"
         style="display:inline-block;background:#00D4AA;color:#0B1120;font-weight:700;
                font-size:14px;padding:14px 32px;border-radius:8px;text-decoration:none;
                margin:8px 0 24px">
        ${ctaLabel}
      </a>` : ""}

      ${noteHtml ? `
      <div style="background:#131F32;border-radius:6px;padding:14px;border:1px solid #1E2F4A;margin-bottom:16px">
        <div style="color:#4A6080;font-size:12px">${noteHtml}</div>
      </div>` : ""}

      <p style="margin:0;color:#4A6080;font-size:11px">
        ${footerNote || "Thank you,<br>NEP Research Team"}
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
}
