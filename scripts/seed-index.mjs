const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const MAX_ROWS = Number(process.env.MAX_ROWS || 60000);
const PER_QUERY = Number(process.env.PER_QUERY || 80);
const PAIRS = Number(process.env.PAIRS || 30);
const HN_WINDOWS = Number(process.env.HN_WINDOWS || 8);
const EMBED_BUDGET = Number(process.env.EMBED_BUDGET || 3000);
const DEADLINE = Date.now() + 75 * 60 * 1000;
const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = "PlydeSeeder/1.0 (open source, github.com/ameer528/Plyde)";

const CITIES = (
  process.env.SEED_CITIES ||
  "London,Manchester,Birmingham,Leeds,Bristol,New York,Los Angeles,Chicago,Houston,Austin,Toronto,Vancouver,Sydney,Melbourne,Dublin,Lagos,Abuja,Nairobi,Accra,Cape Town,Johannesburg"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CATEGORIES = [
  ["amenity", "dentist", "dental clinic"],
  ["amenity", "restaurant", "restaurant"],
  ["amenity", "cafe", "cafe"],
  ["amenity", "veterinary", "veterinary clinic"],
  ["leisure", "fitness_centre", "gym"],
  ["shop", "hairdresser", "hair salon"],
  ["shop", "beauty", "beauty salon"],
  ["shop", "florist", "florist"],
  ["shop", "car_repair", "car repair shop"],
  ["shop", "interior_decoration", "interior design shop"],
  ["office", "lawyer", "law firm"],
  ["office", "estate_agent", "real estate agency"],
  ["office", "accountant", "accounting firm"],
  ["office", "architect", "architecture studio"],
  ["office", "insurance", "insurance agency"],
  ["craft", "photographer", "photography studio"],
  ["healthcare", "physiotherapist", "physiotherapy clinic"],
  ["tourism", "hotel", "hotel"],
];

const SKIP = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
  "youtube.com", "youtu.be", "tiktok.com", "wikipedia.org", "google.com",
  "yelp.com", "tripadvisor.com", "linktr.ee", "wixsite.com", "business.site",
  "github.com", "gitlab.com", "github.io", "vercel.app", "netlify.app",
  "pages.dev", "herokuapp.com", "onrender.com", "replit.app", "replit.dev",
  "apps.apple.com", "play.google.com", "medium.com", "substack.com",
  "notion.site", "notion.so", "reddit.com", "arxiv.org", "news.ycombinator.com",
  "itch.io", "chrome.google.com", "chromewebstore.google.com",
  "huggingface.co", "kickstarter.com", "producthunt.com", "t.me",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function rest(path, opts) {
  const o = opts || {};
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...o,
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
      ...(o.headers || {}),
    },
  });
}

async function rowCount() {
  const r = await rest("company_index?select=host", {
    method: "GET",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") || "";
  const n = Number(cr.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

function makeRow(raw, title, snippet) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (!host.includes(".")) return null;
  if (SKIP.some((s) => host === s || host.endsWith("." + s))) return null;
  return {
    host,
    url: u.origin,
    title: String(title || host).slice(0, 200),
    snippet: String(snippet || "").trim().slice(0, 400),
  };
}

async function saveRows(rows) {
  if (!rows.length) return 0;
  const w = await rest("rpc/index_seed", {
    method: "POST",
    body: JSON.stringify({ p_rows: rows }),
  });
  if (!w.ok) {
    console.log("Saving failed", w.status);
    return 0;
  }
  const n = Number(await w.json());
  return Number.isFinite(n) ? n : 0;
}

function overpassQuery(city, key, value) {
  return `[out:json][timeout:60];area["name"="${city}"]["boundary"="administrative"]->.a;(nwr["${key}"="${value}"]["website"](area.a););out tags ${PER_QUERY};`;
}

async function seedOSM() {
  const pairs = [];
  for (const city of CITIES) for (const c of CATEGORIES) pairs.push({ city, c });
  shuffle(pairs);
  let added = 0;
  for (const { city, c } of pairs.slice(0, PAIRS)) {
    if (Date.now() > DEADLINE) break;
    const [key, value, label] = c;
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body: "data=" + encodeURIComponent(overpassQuery(city, key, value)),
      });
      if (!res.ok) {
        console.log(`Overpass ${res.status} for ${label} in ${city}`);
        await sleep(30000);
        continue;
      }
      const data = await res.json();
      const seen = new Set();
      const rows = [];
      for (const el of data.elements || []) {
        const t = el.tags || {};
        const raw = t.website || t["contact:website"] || "";
        const row = makeRow(
          raw,
          `${t.name || ""} - ${label} in ${city}`.replace(/^ - /, ""),
          `${label} in ${city}. ${t.description || ""}`
        );
        if (row && !seen.has(row.host)) {
          seen.add(row.host);
          rows.push(row);
        }
      }
      added += await saveRows(rows);
      console.log(`${label} in ${city}: ${rows.length} found`);
    } catch (e) {
      console.log("OSM error:", String(e && e.message ? e.message : e));
    }
    await sleep(20000);
  }
  console.log("OSM companies added:", added);
}

async function seedHN() {
  const now = Math.floor(Date.now() / 1000);
  const weeks = shuffle(Array.from({ length: 52 }, (_, i) => i));
  let added = 0;
  for (const w of weeks.slice(0, HN_WINDOWS)) {
    if (Date.now() > DEADLINE) break;
    const to = now - w * 7 * 86400;
    const from = to - 7 * 86400;
    const filters = encodeURIComponent(`created_at_i>=${from},created_at_i<${to}`);
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=1000&numericFilters=${filters}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        console.log("Hacker News feed error", res.status);
        await sleep(5000);
        continue;
      }
      const data = await res.json();
      const seen = new Set();
      const rows = [];
      for (const h of data.hits || []) {
        const clean = String(h.title || "").replace(/^show hn:\s*/i, "").trim();
        if (!h.url || !clean) continue;
        const text = stripHtml(h.story_text).slice(0, 260);
        const row = makeRow(
          h.url,
          `${clean} (early-stage product launched on Hacker News)`,
          `Early-stage startup launch: ${clean}. ${text}`
        );
        if (row && !seen.has(row.host)) {
          seen.add(row.host);
          rows.push(row);
        }
      }
      added += await saveRows(rows);
      console.log(`Show HN week ${w}: ${rows.length} found`);
    } catch (e) {
      console.log("Hacker News error:", String(e && e.message ? e.message : e));
    }
    await sleep(2500);
  }
  console.log("Show HN companies added:", added);
}

async function embedBatch(texts) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: t }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: 768,
        })),
      }),
    }
  );
  if (!res.ok) return { status: res.status, vectors: null };
  const data = await res.json();
  const vectors = (data.embeddings || []).map((e) => e.values);
  return {
    status: 200,
    vectors: vectors.length === texts.length ? vectors : null,
  };
}

async function embedBackfill() {
  if (!GEMINI) {
    console.log("No GEMINI_API_KEY, skipping embeddings.");
    return;
  }
  let done = 0;
  let waits = 0;
  while (done < EMBED_BUDGET && Date.now() < DEADLINE) {
    const r = await rest(
      "company_index?select=host,title,snippet&embedding=is.null&order=last_seen.desc&limit=50"
    );
    if (!r.ok) break;
    const rows = await r.json();
    if (!rows.length) break;
    const texts = rows.map((x) =>
      `${x.title || ""}. ${x.snippet || ""} (${x.host})`.slice(0, 1500)
    );
    const out = await embedBatch(texts);
    if (!out.vectors) {
      if (out.status === 429 && waits < 8) {
        waits++;
        console.log("Embedding rate limited, waiting 65 seconds.");
        await sleep(65000);
        continue;
      }
      console.log("Embedding stopped, status", out.status);
      break;
    }
    const payload = rows.map((x, i) => ({ host: x.host, embedding: out.vectors[i] }));
    const w = await rest("rpc/index_set_embeddings", {
      method: "POST",
      body: JSON.stringify({ p_rows: payload }),
    });
    if (!w.ok) {
      console.log("Saving embeddings failed", w.status);
      break;
    }
    done += rows.length;
    await sleep(4000);
  }
  console.log("Embedded", done, "companies.");
}

async function main() {
  if (!SUPABASE_URL || !KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const before = await rowCount();
  console.log("Index size before:", before);
  if (before >= MAX_ROWS) {
    console.log("Index is at the size cap, nothing to add.");
    return;
  }
  await seedHN();
  await seedOSM();
  await embedBackfill();
  console.log("Index size after:", await rowCount());
}

main();
