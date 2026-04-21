// Vercel serverless function — proxies PubMed & Europe PMC searches
// Bypasses CORS restrictions on external APIs
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { source, url } = req.query;
  if (!url) { res.status(400).json({ error: "url param required" }); return; }

  try {
    // Whitelist allowed domains for security
    const allowed = [
      "eutils.ncbi.nlm.nih.gov",
      "www.ebi.ac.uk",
      "api.semanticscholar.org",
    ];
    const parsed = new URL(decodeURIComponent(url));
    if (!allowed.some(d => parsed.hostname === d)) {
      res.status(403).json({ error: "Domain not allowed" });
      return;
    }

    const response = await fetch(decodeURIComponent(url), {
      headers: { "User-Agent": "NEP-Platform/1.0 (research tool)" },
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
