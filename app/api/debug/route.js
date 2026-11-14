export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ORIGIN = "https://plyde.vercel.app";

async function call(path, body) {
  try {
    const res = await fetch(ORIGIN + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "request failed" } };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!process.env.DEBUG_KEY || url.searchParams.get("k") !== process.env.DEBUG_KEY) {
    return Response.json({ error: "not allowed" }, { status: 403 });
  }

  const site = url.searchParams.get("site") || "";
  const n = Math.min(Number(url.searchParams.get("n")) || 4, 8);
  const out = {};

  const a = await call("/api/analyze", { website: site });
  if (!a.ok) return Response.json({ step: "analyze", error: a.json });
  const prof = a.json.result;
  const summary = prof.business_summary || "";
  const target = prof.segments && prof.segments[0] ? prof.segments[0].name : "";
  const ownHost = a.json.site === "this business" ? "" : a.json.site;

  out.summary = summary;
  out.segments = (prof.segments || []).map((s) => `${s.name} (${s.fit_score})`);
  out.target_used = target;

  const m = await call("/api/competitors", { profile: { summary }, host: ownHost });
  out.competitors = m.ok ? (m.json.competitors || []).map((c) => c.url) : m.json;

  const d = await call("/api/discover", { profile: { summary, target } });
  if (!d.ok) {
    out.discover_error = d.json;
    return Response.json(out);
  }
  out.queries = d.json.queries;
  out.candidates = (d.json.sites || []).map((s) => s.host);

  out.results = [];
  for (const s of (d.json.sites || []).slice(0, n)) {
    const r = await call("/api/research", {
      website: s.url,
      profile: { summary, target, edge: "" },
    });
    out.results.push(
      r.ok
        ? {
            site: r.json.site,
            relationship: r.json.relationship,
            stage: r.json.stage,
            fit: r.json.fit_score,
            why: r.json.fit_reason,
            socials: Object.keys(r.json.socials || {}),
            emails: (r.json.emails || []).length,
          }
        : { site: s.host, error: r.json.error }
    );
  }
  return Response.json(out);
                                                                }
