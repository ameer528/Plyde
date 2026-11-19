import { db } from "../../db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ORIGIN = "https://plyde.vercel.app";
const ALLOWED = [
  "/api/analyze",
  "/api/competitors",
  "/api/discover",
  "/api/research",
  "/api/opportunities",
  "/api/verify",
];

async function call(path, body) {
  try {
    const res = await fetch(ORIGIN + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(200000),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: "request failed: " + String(e && e.name ? e.name : e) } };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!process.env.DEBUG_KEY || url.searchParams.get("k") !== process.env.DEBUG_KEY) {
    return Response.json({ error: "not allowed" }, { status: 403 });
  }

  const proxy = url.searchParams.get("proxy");
  if (proxy) {
    if (!ALLOWED.includes(proxy)) {
      return Response.json({ error: "path not allowed" }, { status: 400 });
    }
    let bodyObj = {};
    try {
      bodyObj = JSON.parse(url.searchParams.get("body") || "{}");
    } catch {}
    const started = Date.now();
    const r = await call(proxy, bodyObj);
    return Response.json({ ms: Date.now() - started, status: r.status, json: r.json });
  }

  if (url.searchParams.get("dbtest")) {
    const out = {
      has_url: !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      has_session_secret: !!process.env.SESSION_SECRET,
    };
    try {
      const supabase = db();
      const ins = await supabase
        .from("campaigns")
        .insert({ owner_email: "debug@plyde.test", title: "debug" })
        .select("id")
        .single();
      out.insert = ins.error ? { error: ins.error.message, code: ins.error.code } : "ok";
      if (ins.data) await supabase.from("campaigns").delete().eq("id", ins.data.id);

      const sel = await supabase
        .from("profiles")
        .select("name,booking_link")
        .eq("owner_email", "debug@plyde.test")
        .maybeSingle();
      out.profiles_select = sel.error
        ? { error: sel.error.message, code: sel.error.code, details: sel.error.details, hint: sel.error.hint }
        : "ok";

      const ups = await supabase
        .from("profiles")
        .upsert({ owner_email: "debug@plyde.test", name: "debug" }, { onConflict: "owner_email" });
      out.profiles_upsert = ups.error
        ? { error: ups.error.message, code: ups.error.code, details: ups.error.details, hint: ups.error.hint }
        : "ok";
      if (!ups.error) await supabase.from("profiles").delete().eq("owner_email", "debug@plyde.test");
    } catch (e) {
      out.exception = String(e && e.message ? e.message : e);
    }
    return Response.json(out);
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
