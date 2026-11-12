const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

const SKIP = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
  "youtube.com", "reddit.com", "medium.com", "wikipedia.org", "crunchbase.com",
  "g2.com", "capterra.com", "clutch.co", "forbes.com", "techcrunch.com",
  "github.com", "quora.com", "pinterest.com", "tiktok.com", "substack.com",
  "yelp.com", "tripadvisor.com", "glassdoor.com", "indeed.com", "amazon.com",
  "google.com", "bing.com", "apple.com", "play.google.com", "producthunt.com",
  "coindesk.com", "cointelegraph.com", "coinmarketcap.com", "coingecko.com",
  "bloomberg.com", "reuters.com", "nytimes.com", "cnn.com", "bbc.com",
  "hubspot.com", "shopify.com", "wordpress.com", "wix.com", "blogspot.com",
  "linktr.ee", "notion.so", "discord.com", "t.me", "telegram.org",
];

function skipHost(host) {
  return SKIP.some((s) => host === s || host.endsWith("." + s));
}

async function makeQueries(profile) {
  const fallback = [`${profile.target || "companies"} official website`];
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback;

  const prompt = `A freelancer sells this: ${profile.summary}
They want to reach: ${profile.target || "businesses that need this service"}

Write 3 different web search queries that would find the OFFICIAL WEBSITES of companies that fit this target (not articles, not lists, not directories). Make each query different in wording.

Return ONLY valid JSON: {"queries": ["query 1", "query 2", "query 3"]}`;

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
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const list = (parsed.queries || [])
        .map((q) => String(q).slice(0, 200))
        .filter(Boolean)
        .slice(0, 3);
      if (list.length) return list;
    } catch {
      continue;
    }
  }
  return fallback;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const profile = {
    summary: String(body.profile?.summary || "").slice(0, 1500),
    target: String(body.profile?.target || "").slice(0, 300),
  };
  if (!profile.summary) {
    return Response.json({ error: "Missing your business profile." }, { status: 400 });
  }

  const tkey = process.env.TAVILY_API_KEY;
  if (!tkey) {
    return Response.json({ error: "The search key is missing on the server." }, { status: 500 });
  }

  const queries = await makeQueries(profile);
  const sites = [];
  let lastStatus = 0;

  for (const q of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tkey}`,
        },
        body: JSON.stringify({ query: q, search_depth: "basic", max_results: 8 }),
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.results || []) {
        try {
          const u = new URL(r.url);
          const host = u.hostname.replace(/^www\./, "").toLowerCase();
          if (skipHost(host)) continue;
          if (sites.some((s) => s.host === host)) continue;
          sites.push({ host, url: u.origin, title: String(r.title || "").slice(0, 120) });
        } catch {}
      }
    } catch {
      continue;
    }
  }

  if (!sites.length) {
    if (lastStatus === 401 || lastStatus === 403) {
      return Response.json({ error: "The search key was rejected. Check TAVILY_API_KEY in Vercel." }, { status: 502 });
    }
    if (lastStatus === 429) {
      return Response.json({ error: "The free search limit was reached. Try again later." }, { status: 502 });
    }
    return Response.json({ error: "No companies found. Try a different customer type." }, { status: 404 });
  }

  return Response.json({ queries, sites: sites.slice(0, 10) });
    }
