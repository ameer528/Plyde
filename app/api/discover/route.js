import { askAI } from "../../ai";

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
  "microsoft.com", "salesforce.com", "adobe.com", "oracle.com", "ibm.com",
  "meta.com", "openai.com", "anthropic.com", "stripe.com", "slack.com",
  "zoom.us", "dropbox.com", "atlassian.com", "zendesk.com", "mailchimp.com",
  "wsj.com", "ft.com", "theverge.com", "wired.com", "businessinsider.com",
  "inc.com", "entrepreneur.com", "fastcompany.com", "venturebeat.com",
  "ycombinator.com", "angel.co", "wellfound.com", "pitchbook.com",
  "tracxn.com", "owler.com", "zoominfo.com", "apollo.io", "similarweb.com",
  "trustpilot.com", "softwareadvice.com", "getapp.com", "sourceforge.net",
  "gartner.com", "mckinsey.com", "statista.com", "ycharts.com",
];

function skipHost(host) {
  return SKIP.some((s) => host === s || host.endsWith("." + s));
}

async function makeQueries(profile) {
  const t = profile.target || "small business";
  const fallback = [
    `${t} small business official website`,
    `new ${t} business just launched`,
    `${t} growing company official website`,
  ];

  const prompt = `A freelancer or small company sells this: ${profile.summary}
Their ideal customer type: ${t}

Write 3 different web search queries that find the OFFICIAL WEBSITES of small or new businesses that would BUY this. Think about what kind of business the BUYER runs (for example: an online store, an agency, a clinic, a coach, a school, a local shop, a startup in some field) and search for those buyers.

Rules:
- Describe the BUYER's business. Never describe the seller's own product category. Do NOT write queries that would return companies that build, sell or compete with what this freelancer sells.
- Prefer early-stage or small buyers. Use words about the buyer's business such as "new", "just launched", "launching soon", "founded 2025" or "small team" when they fit.
- Avoid queries that return big famous companies, news articles, blog posts or lists.
- The current year is 2026.
- Make the 3 queries clearly different from each other (different kinds of buyers or different wording).

Return ONLY valid JSON: {"queries": ["query 1", "query 2", "query 3"]}`;

  const answer = await askAI(prompt);
  if (answer.result && Array.isArray(answer.result.queries)) {
    const list = answer.result.queries
      .map((q) => String(q).slice(0, 200))
      .filter(Boolean)
      .slice(0, 3);
    if (list.length) return list;
  }
  return fallback;
}

async function tavily(query, key, withDate) {
  try {
    const payload = {
      query,
      search_depth: "basic",
      max_results: 10,
      exclude_domains: SKIP,
    };
    if (withDate) payload.time_range = "year";
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: res.status, results: [] };
    const data = await res.json();
    return { status: 200, results: data.results || [] };
  } catch {
    return { status: -2, results: [] };
  }
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
  let lastStatus = 200;

  function collect(results) {
    for (const r of results) {
      try {
        const u = new URL(r.url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        if (skipHost(host)) continue;
        if (sites.some((s) => s.host === host)) continue;
        sites.push({ host, url: u.origin, title: String(r.title || "").slice(0, 120) });
      } catch {}
    }
  }

  for (const q of queries) {
    const out = await tavily(q, tkey, true);
    lastStatus = out.status;
    collect(out.results);
  }

  if (sites.length < 6) {
    const out = await tavily(queries[0], tkey, false);
    lastStatus = out.status;
    collect(out.results);
  }

  if (!sites.length) {
    if (lastStatus === 401 || lastStatus === 403) {
      return Response.json({ error: "The search key was rejected. Check TAVILY_API_KEY in Vercel." }, { status: 502 });
    }
    if (lastStatus === 429 || lastStatus === 432 || lastStatus === 433) {
      return Response.json({ error: "The free search limit was reached. Try again later." }, { status: 502 });
    }
    return Response.json({ error: "No companies found. Try again in a moment." }, { status: 404 });
  }

  return Response.json({ queries, sites: sites.slice(0, 15) });
}
