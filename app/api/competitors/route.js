import { askAI } from "../../ai";
import { owner } from "../../db";

async function searchWeb(query, key) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 8 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

function cleanDomain(raw) {
  let d = String(raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : "";
}

export async function POST(request) {
  if (!owner(request)) {
    return Response.json({ error: "Connect Gmail first." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const summary = String(body.profile?.summary || "").slice(0, 1500);
  const ownHost = String(body.host || "").replace(/^www\./, "").toLowerCase();
  if (!summary) {
    return Response.json({ error: "Missing your business profile." }, { status: 400 });
  }

  const tkey = process.env.TAVILY_API_KEY;
  if (!tkey) {
    return Response.json({ error: "The search key is missing on the server." }, { status: 500 });
  }

  const queries = [];
  if (ownHost) queries.push(`alternatives to ${ownHost}`);
  queries.push(`${summary.slice(0, 90)} competitors`);

  const seen = new Set();
  const results = [];
  for (const q of queries) {
    for (const r of await searchWeb(q, tkey)) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      results.push({
        title: String(r.title || "").slice(0, 120),
        content: String(r.content || "").replace(/\s+/g, " ").slice(0, 300),
      });
    }
  }

  if (!results.length) {
    return Response.json({ error: "No competitor information found." }, { status: 404 });
  }

  const listing = results
    .slice(0, 12)
    .map((r, i) => `${i + 1}. ${r.title} | ${r.content}`)
    .join("\n");

  const prompt = `You are a market research assistant.
The user's business: ${summary}
The user's website: ${ownHost || "none"}

Below are web search results (title | snippet). Find the real companies that compete with the user: they sell the same kind of product or service. Companies may be named in the titles or snippets even when the result is an article or a list.

${listing}

Rules:
- Only include real companies that clearly compete with the user. Never include the user's own company.
- For each, give the company's own website domain, like "make.com". Never give an article, blog or news domain. If you are not sure of a company's real domain, leave "domain" empty.
- Do not invent companies that are not named in the results.

Return ONLY valid JSON in exactly this shape:
{
  "competitors": [
    { "name": "company name", "domain": "company.com", "note": "one short line on what they offer" }
  ],
  "differentiators": ["up to 3 short points on how the user could stand out, based on the user's description"],
  "positioning": "one sentence on how the user could position themselves"
}
List at most 5 competitors.`;

  const answer = await askAI(prompt);
  if (answer.error) {
    return Response.json({ error: answer.error }, { status: 502 });
  }
  const r = answer.result || {};

  const competitors = [];
  for (const c of Array.isArray(r.competitors) ? r.competitors : []) {
    const domain = cleanDomain(c.domain);
    if (!domain || domain === ownHost) continue;
    if (competitors.some((x) => x.url === "https://" + domain)) continue;
    competitors.push({
      name: String(c.name || domain).slice(0, 80),
      url: "https://" + domain,
      note: String(c.note || "").slice(0, 160),
    });
  }

  return Response.json({
    competitors: competitors.slice(0, 5),
    differentiators: Array.isArray(r.differentiators)
      ? r.differentiators.slice(0, 3).map(String)
      : [],
    positioning: String(r.positioning || ""),
  });
}
