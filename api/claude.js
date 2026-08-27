// Vercel serverless function — proxies Anthropic API calls server-side
// Avoids CSP restrictions on the browser
export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: body.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: body.max_tokens || 500,
        messages: body.messages,
      }),
    });

    const data = await response.json();
    if (response.status === 400 && /model:/i.test(data?.error?.message || "")) {
      res.status(400).json({
        error: `${data.error.message} — check console.anthropic.com for models available to this API key, then update ANTHROPIC_MODEL.`,
      });
      return;
    }
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
