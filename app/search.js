import { db } from "./db";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;
const MIN_SIM = 0.6;
const EMBED_BACKFILL = 40;

const STOP = new Set([
  "our", "clients", "client", "book", "call", "case", "studies", "study",
  "services", "service", "contact", "just", "launched", "small", "team",
  "boutique", "new", "founded", "with", "that", "this", "from", "your",
  "best", "get", "quote", "help", "helps", "company", "companies",
  "business", "businesses", "agency", "website", "about", "free", "online",
  "near", "local",
]);

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function terms(query) {
  const words = String(query || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return [...new Set(words)].slice(0, 3);
}

async function embedBatch(texts, taskType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !texts.length) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`,
      {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: "models/" + EMBED_MODEL,
            content: { parts: [{ text: t }] },
            taskType,
            outputDimensionality: EMBED_DIMS,
          })),
        }),
      }
    );
    if (!res.ok) {
      console.error("embed-failed", res.status);
      return null;
    }
    const data = await res.json();
    const out = (data.embeddings || []).map((e) => e.values);
    return out.length === texts.length && out.every((v) => Array.isArray(v) && v.length) ? out : null;
  } catch (e) {
    console.error("embed-exception", String(e && e.message ? e.message : e));
    return null;
  }
}

async function embedMissing(limit) {
  try {
    const { data } = await db()
      .from("company_index")
      .select("host,title,snippet")
      .is("embedding", null)
      .order("last_seen", { ascending: false })
      .limit(limit);
    if (!data || !data.length) return;
    const texts = data.map((r) =>
      `${r.title || ""}. ${r.snippet || ""} (${r.host})`.slice(0, 1500)
    );
    const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT");
    if (!vecs) return;
    const rows = data.map((r, i) => ({ host: r.host, embedding: vecs[i] }));
    await db().rpc("index_set_embeddings", { p_rows: rows });
  } catch {}
}

async function semantic(query, opts) {
  try {
    const q = await embedBatch([query], "RETRIEVAL_QUERY");
    if (!q) return null;
    const exclude = Array.from(opts.known || []).slice(0, 5000);
    const { data, error } = await db().rpc("index_semantic", {
      p_embedding: q[0],
      p_exclude: exclude,
      p_limit: 20,
      p_min: MIN_SIM,
    });
    if (error) {
      console.error("index-semantic-error", error.message);
      return null;
    }
    const list = Array.isArray(data) ? data : [];
    console.log("index-semantic", {
      found: list.length,
      best: list[0] ? Number(list[0].similarity).toFixed(3) : null,
    });
    if (list.length < 8) return null;
    return {
      status: 200,
      provider: "index-semantic",
      results: list.map((r) => ({
        url: r.url,
        title: r.title || "",
        content: r.snippet || "",
      })),
    };
  } catch {
    return null;
  }
}

async function keyword(query, opts) {
  try {
    const t = terms(query);
    if (t.length < 2) return null;
    const exclude = Array.from(opts.known || []).slice(0, 5000);
    const { data, error } = await db().rpc("index_search", {
      p_terms: t.join(" "),
      p_exclude: exclude,
      p_limit: 20,
    });
    if (error || !Array.isArray(data) || data.length < 8) return null;
    return {
      status: 200,
      provider: "index",
      results: data.map((r) => ({
        url: r.url,
        title: r.title || "",
        content: r.snippet || "",
      })),
    };
  } catch {
    return null;
  }
}

async function fromIndex(query, opts) {
  const s = await semantic(query, opts);
  if (s) return s;
  return keyword(query, opts);
}

async function store(results, skip) {
  try {
    const rows = [];
    const seen = new Set();
    for (const r of results) {
      const host = hostOf(r.url);
      if (!host || seen.has(host)) continue;
      if ((skip || []).some((s) => host === s || host.endsWith("." + s))) continue;
      let origin = "";
      try {
        origin = new URL(r.url).origin;
      } catch {
        continue;
      }
      seen.add(host);
      rows.push({
        host,
        url: origin,
        title: String(r.title || "").slice(0, 200),
        snippet: String(r.content || "").replace(/\s+/g, " ").slice(0, 400),
      });
    }
    if (rows.length) await db().rpc("index_upsert", { p_rows: rows });
    await embedMissing(EMBED_BACKFILL);
  } catch {}
}

async function tavily(query, opts) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { skipped: true, status: 0, results: [] };
  try {
    const payload = {
      query,
      search_depth: "basic",
      max_results: 10,
      exclude_domains: opts.skip || [],
    };
    if (opts.withDate) payload.time_range = "year";
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
    return {
      status: 200,
      results: (data.results || []).map((r) => ({
        url: r.url,
        title: r.title || "",
        content: r.content || "",
      })),
    };
  } catch {
    return { status: -2, results: [] };
  }
}

async function exa(query) {
  const key = process.env.EXA_API_KEY;
  if (!key) return { skipped: true, status: 0, results: [] };

  async function call(withCategory) {
    const body = {
      query,
      type: "auto",
      numResults: 10,
      contents: { text: { maxCharacters: 400 } },
    };
    if (withCategory) body.category = "company";
    return fetch("https://api.exa.ai/search", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
    });
  }

  try {
    let res = await call(true);
    if (res.status === 400) res = await call(false);
    if (!res.ok) return { status: res.status, results: [] };
    const data = await res.json();
    return {
      status: 200,
      results: (data.results || [])
        .filter((r) => r && r.url)
        .map((r) => ({
          url: r.url,
          title: r.title || "",
          content: String(r.text || "").replace(/\s+/g, " "),
        })),
    };
  } catch {
    return { status: -2, results: [] };
  }
}

export function hasSearchKey() {
  return !!(process.env.TAVILY_API_KEY || process.env.EXA_API_KEY);
}

export async function webSearch(query, opts) {
  const options = opts || {};

  const cached = await fromIndex(query, options);
  if (cached) return cached;

  const providers = [
    ["tavily", tavily],
    ["exa", exa],
  ];
  let last = { status: 0, results: [] };
  for (const [name, fn] of providers) {
    const out = await fn(query, options);
    if (out.skipped) continue;
    last = out;
    if (out.status === 200 && out.results.length > 0) {
      await store(out.results, options.skip);
      return { ...out, provider: name };
    }
  }
  return last;
  }
