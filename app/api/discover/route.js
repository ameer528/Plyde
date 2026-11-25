import { askAI } from "../../ai";
import { db, owner } from "../../db";
import { checkLimit } from "../../usage";
import { webSearch, hasSearchKey } from "../../search";

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

function normHost(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

async function knownSites(email) {
  try {
    const { data } = await db()
      .from("prospects")
      .select("site")
      .eq("owner_email", email)
      .limit(10000);
    return new Set((data || []).map((r) => normHost(r.site)).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function makeQueries(profile) {
  const t = profile.target || "small business";
  const fallback = [
    `${t} our clients book a call`,
    `${t} case studies our services`,
    `new ${t} just launched contact us`,
  ];

  const prompt = `A freelancer or small company sells this: ${profile.summary}
Their ideal customer type: ${t}

Write 3 different web search queries that find the OFFICIAL WEBSITES of small or new businesses that would BUY this.

Think about how the BUYER describes itself on its own homepage. Buyers use phrases like "our clients", "our services", "book a call", "case studies", "we help", "get a quote", "contact us". Software vendors and platforms use phrases like "pricing", "free trial", "sign up", "integrations", "API".

Rules:
- Every query must include one or two buyer-style phrases such as "our clients", "book a call", "case studies" or "our services".
- Describe the BUYER's business. Do NOT use words that name the seller's own product category, because those return companies that sell the same thing. Avoid words like "builder", "platform", "software", "tool", "no-code", "SaaS" unless the buyer itself would use them.
- Prefer early-stage or small buyers. Words like "new", "boutique", "small team", "just launched" or "founded 2025" are fine when they fit.
- Avoid queries that return big famous companies, news articles, blog posts or lists.
- The current year is 2026.
- Make the 3 queries clearly different from each other.

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

async function screen(sites, profile) {
  if (!sites.length) return sites;
  const list = sites
    .map((s, i) => `${i}. ${s.host} | ${s.title} | ${s.snippet}`)
    .join("\n");
  const prompt = `A freelancer or small company sells this: ${profile.summary}
They want to reach: ${profile.target || "businesses that need this"}

Below are websites found by a search (number. domain | title | snippet). Label each one:
- "buyer": a business that runs something where the seller's service would solve a real problem, and that does NOT sell the same kind of product or service as the seller.
- "competitor": it sells or builds the same kind of product or service as the seller, or is a direct alternative to it.
- "other": media, directory, blog, listing site, data provider, big platform, or no clear need.
Judge only from the text given. When unsure, use "buyer".

${list}

Return ONLY valid JSON: {"labels": [{"i": 0, "label": "buyer"}]}`;

  const answer = await askAI(prompt);
  if (!answer.result || !Array.isArray(answer.result.labels)) return sites;
  const drop = new Set(
    answer.result.labels
      .filter((l) => l.label === "competitor" || l.label === "other")
      .map((l) => Number(l.i))
  );
  const kept = sites.filter((_, i) => !drop.has(i));
  return kept.length ? kept : sites;
}

export async function POST(request) {
  const email = owner(request);
  if (!email) {
    return Response.json({ error: "Connect Gmail first." }, { status: 401 });
  }
  const lim = await checkLimit(request, "discover", 0, 1000);
  if (!lim.allowed) {
    return Response.json(
      { error: "Daily search limit reached. Try again tomorrow.", limit: true },
      { status: 429 }
    );
  }

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

  if (!hasSearchKey()) {
    return Response.json({ error: "The search key is missing on the server." }, { status: 500 });
  }

  const known = await knownSites(email);
  let skippedKnown = 0;

  const queries = await makeQueries(profile);
  const sites = [];
  let lastStatus = 200;

  function collect(results) {
    for (const r of results) {
      try {
        const u = new URL(r.url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        if (skipHost(host)) continue;
        if (known.has(host)) {
          skippedKnown++;
          continue;
        }
        if (sites.some((s) => s.host === host)) continue;
        sites.push({
          host,
          url: u.origin,
          title: String(r.title || "").slice(0, 120),
          snippet: String(r.content || "").replace(/\s+/g, " ").slice(0, 220),
        });
      } catch {}
    }
  }

  for (const q of queries) {
    const out = await webSearch(q, { skip: SKIP, withDate: true, known });
    lastStatus = out.status;
    collect(out.results);
  }

  if (sites.length < 6) {
    const out = await webSearch(queries[0], { skip: SKIP, withDate: false, known });
    lastStatus = out.status;
    collect(out.results);
  }

  if (!sites.length) {
    if (lastStatus === 401 || lastStatus === 403) {
      return Response.json(
        { error: "A search key was rejected. Check TAVILY_API_KEY and EXA_API_KEY in Vercel." },
        { status: 502 }
      );
    }
    if ([402, 429, 432, 433].includes(lastStatus)) {
      return Response.json(
        { error: "The free search limit was reached. Try again later." },
        { status: 502 }
      );
    }
    if (skippedKnown > 0) {
      return Response.json(
        {
          error:
            "Every company this search found is already in your list. Try a different customer type.",
          skipped_known: skippedKnown,
        },
        { status: 404 }
      );
    }
    return Response.json({ error: "No companies found. Try again in a moment." }, { status: 404 });
  }

  const screened = await screen(sites.slice(0, 15), profile);
  return Response.json({
    queries,
    screened_out: Math.min(sites.length, 15) - screened.length,
    skipped_known: skippedKnown,
    sites: screened.map((s) => ({ host: s.host, url: s.url, title: s.title })),
  });
                                                     }
