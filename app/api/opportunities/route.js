import { askAI } from "../../ai";
import { owner } from "../../db";

async function searchNotes(summary, key) {
  if (!key) return "";
  const queries = [
    `${summary.slice(0, 80)} use cases by industry`,
    `industries that benefit from ${summary.slice(0, 60)}`,
  ];
  const lines = [];
  for (const q of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: q, search_depth: "basic", max_results: 6 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.results || []) {
        lines.push(
          `- ${String(r.title || "").slice(0, 100)}: ${String(r.content || "").replace(/\s+/g, " ").slice(0, 220)}`
        );
      }
    } catch {}
  }
  return lines.slice(0, 12).join("\n");
}

function text(v, max) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
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
  if (!summary) {
    return Response.json({ error: "Missing your business profile." }, { status: 400 });
  }

  const notes = await searchNotes(summary, process.env.TAVILY_API_KEY);

  const prompt = `You are a market strategist who finds buyers the owner has not thought of.

The business and what it offers: ${summary}

Web search notes about this kind of offering (may be noisy, use them only as hints):
${notes || "none"}

Task: list 14 different kinds of businesses or industries that could genuinely need what this business offers. Go well beyond the obvious.
Include:
- Obvious fits: the buyers the owner already expects.
- Hidden fits: industries or situations where the need is real but the owner may not have thought of it. Make the angle clear.
Think about who has this problem, what event makes the need urgent (a launch, growth, a new market, compliance, cost pressure, hiring), and which roles feel the pain.

For each entry give:
- name: a short industry or business type, such as "Dental clinics"
- buyer: the job titles that decide on this kind of purchase, such as "Practice manager, marketing lead"
- pain: the specific problem this offering solves for them, one sentence
- use: how they would use it, one sentence
- trigger: an event that makes them need it now, one sentence
- obviousness: "obvious" or "hidden"
- fit_score: 0 to 100
- phrase: how that buyer describes itself on its own website, a short phrase a web search would match, such as "family dental clinic book an appointment"

Rules: real business types only. Do not list the owner's competitors, meaning companies that sell the same thing. No two entries about the same industry. Do not invent statistics. At least 5 entries must be "hidden".

Return ONLY valid JSON: {"opportunities": [ {"name":"","buyer":"","pain":"","use":"","trigger":"","obviousness":"","fit_score":0,"phrase":""} ]}`;

  const answer = await askAI(prompt, { quality: true });
  if (answer.error) {
    return Response.json({ error: answer.error }, { status: 502 });
  }

  const raw = Array.isArray(answer.result?.opportunities) ? answer.result.opportunities : [];
  const seen = new Set();
  const list = [];
  for (const o of raw) {
    const name = text(o.name, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    list.push({
      name,
      buyer: text(o.buyer, 120),
      pain: text(o.pain, 220),
      use: text(o.use, 220),
      trigger: text(o.trigger, 220),
      obviousness: o.obviousness === "hidden" ? "hidden" : "obvious",
      fit_score: Math.max(0, Math.min(100, Number(o.fit_score) || 0)),
      phrase: text(o.phrase, 100),
    });
  }
  list.sort((a, b) => b.fit_score - a.fit_score);
  return Response.json({ opportunities: list.slice(0, 16) });
}
