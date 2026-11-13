const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

async function searchWeb(query, key) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 6 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      return JSON.parse(clean);
    } catch {
      continue;
    }
  }
  return null;
}

export async function POST(request) {
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
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, "").toLowerCase();
        if (host === ownHost || seen.has(host)) continue;
        seen.add(host);
        results.push({
          title: String(r.title || "").slice(0, 120),
          url: r.url,
          content: String(r.content || "").slice(0, 300),
        });
      } catch {}
    }
  }

  if (!results.length) {
    return Response.json({ error: "No competitor information found." }, { status: 404 });
  }

  const listing = results
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.title} | ${r.url} | ${r.content}`)
    .join("\n");

  const prompt = `You are a market research assistant.
The user's business: ${summary}
The user's website: ${ownHost || "none"}

Below are web search results (title | link | snippet). Use ONLY these results and the user's description. Do not invent facts. If the results do not clearly show competitors, return fewer competitors.

${listing}

Return ONLY valid JSON in exactly this shape:
{
  "competitors": [
    { "name": "company name", "url": "link from the results", "note": "one short line on what they offer" }
  ],
  "differentiators": ["up to 3 short points on how the user could stand out, based on the user's description"],
  "positioning": "one sentence on how the user could position themselves"
}
List at most 4 competitors, and only real companies that appear in the results and compete with the user.`;

  const answer = await askGemini(prompt);
  if (!answer) {
    return Response.json({ error: "The AI could not answer right now." }, { status: 502 });
  }

  return Response.json({
    competitors: Array.isArray(answer.competitors) ? answer.competitors.slice(0, 4) : [],
    differentiators: Array.isArray(answer.differentiators)
      ? answer.differentiators.slice(0, 3).map(String)
      : [],
    positioning: String(answer.positioning || ""),
  });
        }
