const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const MAX_ROWS = Number(process.env.MAX_ROWS || 60000);
const PER_QUERY = Number(process.env.PER_QUERY || 80);
const PAIRS = Number(process.env.PAIRS || 30);
const EMBED_BUDGET = Number(process.env.EMBED_BUDGET || 3000);
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
  "youtube.com", "tiktok.com", "wikipedia.org", "google.com", "yelp.com",
  "tripadvisor.com", "linktr.ee", "wixsite.com", "business.site",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function overpassQuery(city, key, value) {
  return `[out:json][timeout:60];area["name"="${city}"]["boundary"="administrative"]->.a;(nwr["${key}"="${value}"]["website"](area.a););out tags ${PER_QUERY};`;
}

function toRow(el, label, city) {
  const t = el.tags || {};
  const raw = t.website || t["contact:website"] || "";
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
  const name = t.name || host;
  return {
    host,
    url: u.origin,
    title: `${name} - ${label} in ${city}`.slice(0, 200),
    snippet: `${label} in ${city}. ${t.description || ""}`.trim().slice(0, 400),
  };
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
  while (done < EMBED_BUDGET) {
    const r = await rest(
      "company_index?select=host,title,snippet&embedding=is.null&order=last_seen.desc&limit=100"
    );
    if (!r.ok) break;
    const rows = await r.json();
    if (!rows.length) break;
    const texts = rows.map((x) => `${x.title || ""}. ${x.snippet || ""} (${x.host})`.slice(0, 1500));
    const out = await embedBatch(texts);
    if (!out.vectors) {
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
    await sleep(1500);
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

  const pairs = [];
  for (const city of CITIES) for (const c of CATEGORIES) pairs.push({ city, c });
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  let added = 0;
  for (const { city, c } of pairs.slice(0, PAIRS)) {
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
        const row = toRow(el, label, city);
        if (row && !seen.has(row.host)) {
          seen.add(row.host);
          rows.push(row);
        }
      }
      if (rows.length) {
        const w = await rest("rpc/index_seed", {
          method: "POST",
          body: JSON.stringify({ p_rows: rows }),
        });
        if (w.ok) {
          const n = Number(await w.json());
          added += Number.isFinite(n) ? n : 0;
        } else {
          console.log("Saving failed", w.status);
        }
      }
      console.log(`${label} in ${city}: ${rows.length} found`);
    } catch (e) {
      console.log("Error:", String(e && e.message ? e.message : e));
    }
    await sleep(20000);
  }
  console.log("New companies added:", added);
  await embedBackfill();
  console.log("Index size after:", await rowCount());
}

main();
