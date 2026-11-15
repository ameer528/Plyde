import { NextResponse } from "next/server";
import { db, owner } from "../../db";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "replied", "booked", "won", "lost"];
const KINDS = ["sent", "replied", "booked"];

function deny() {
  return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
}
function fail(message) {
  return NextResponse.json({ error: message || "Could not save." }, { status: 500 });
}
function text(value, max) {
  return String(value || "").slice(0, max);
}

export async function GET(request) {
  const email = owner(request);
  if (!email) return deny();
  const supabase = db();
  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("owner_email", email)
      .maybeSingle();
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const [p, a] = await Promise.all([
      supabase
        .from("prospects")
        .select("id,site,url,fit_score,stage,company_summary,emails,socials,status,notes,follow_up,created_at")
        .eq("campaign_id", id)
        .eq("owner_email", email)
        .order("fit_score", { ascending: false }),
      supabase
        .from("activity")
        .select("id,prospect_id,kind,channel,created_at")
        .eq("campaign_id", id)
        .eq("owner_email", email)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    return NextResponse.json({ campaign, prospects: p.data || [], activity: a.data || [] });
  }

  const [c, p, a] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id,title,website,summary,target,created_at")
      .eq("owner_email", email)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("prospects").select("campaign_id,status").eq("owner_email", email).limit(5000),
    supabase.from("activity").select("campaign_id,kind,channel").eq("owner_email", email).limit(10000),
  ]);
  if (c.error) return fail("Could not load campaigns.");

  const stats = {};
  const get = (cid) =>
    stats[cid] || (stats[cid] = { prospects: 0, sent: 0, replied: 0, booked: 0, channels: {} });
  for (const r of p.data || []) get(r.campaign_id).prospects++;
  for (const r of a.data || []) {
    const t = get(r.campaign_id);
    if (r.kind === "sent") {
      t.sent++;
      t.channels[r.channel] = (t.channels[r.channel] || 0) + 1;
    } else if (r.kind === "replied") t.replied++;
    else if (r.kind === "booked") t.booked++;
  }

  const campaigns = (c.data || []).map((x) => ({ ...x, ...get(x.id) }));
  const totals = { campaigns: campaigns.length, prospects: 0, sent: 0, replied: 0, booked: 0, channels: {} };
  for (const x of campaigns) {
    totals.prospects += x.prospects;
    totals.sent += x.sent;
    totals.replied += x.replied;
    totals.booked += x.booked;
    for (const k of Object.keys(x.channels)) {
      totals.channels[k] = (totals.channels[k] || 0) + x.channels[k];
    }
  }
  return NextResponse.json({ campaigns, totals });
}

export async function POST(request) {
  const email = owner(request);
  if (!email) return deny();
  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const supabase = db();

  if (b.action === "create_campaign") {
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        owner_email: email,
        title: text(b.title, 120) || "My campaign",
        website: text(b.website, 300),
        description: text(b.description, 2000),
        summary: text(b.summary, 1500),
        target: text(b.target, 300),
      })
      .select("id")
      .single();
    if (error) return fail();
    return NextResponse.json({ id: data.id });
  }

  if (b.action === "add_prospect") {
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", b.campaignId)
      .eq("owner_email", email)
      .maybeSingle();
    if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const p = b.prospect || {};
    let data = null;
    try {
      const raw = JSON.stringify(p.data || null);
      data = raw.length < 60000 ? p.data : null;
    } catch {}
    const { data: row, error } = await supabase
      .from("prospects")
      .upsert(
        {
          owner_email: email,
          campaign_id: camp.id,
          site: text(p.site, 200),
          url: text(p.url, 300),
          fit_score: Math.max(0, Math.min(100, Number(p.fit_score) || 0)),
          stage: text(p.stage, 20),
          company_summary: text(p.company_summary, 800),
          emails: Array.isArray(p.emails) ? p.emails.slice(0, 5) : [],
          socials: p.socials && typeof p.socials === "object" ? p.socials : {},
          data,
        },
        { onConflict: "campaign_id,site" }
      )
      .select("id")
      .single();
    if (error) return fail();
    return NextResponse.json({ id: row.id });
  }

  if (b.action === "update_prospect") {
    const { data: cur } = await supabase
      .from("prospects")
      .select("id,campaign_id,status")
      .eq("id", b.id)
      .eq("owner_email", email)
      .maybeSingle();
    if (!cur) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    const patch = { updated_at: new Date().toISOString() };
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) {
        return NextResponse.json({ error: "Bad status." }, { status: 400 });
      }
      patch.status = b.status;
    }
    if (b.notes !== undefined) patch.notes = text(b.notes, 4000);
    if (b.follow_up !== undefined) patch.follow_up = b.follow_up ? text(b.follow_up, 10) : null;
    const { error } = await supabase
      .from("prospects")
      .update(patch)
      .eq("id", cur.id)
      .eq("owner_email", email);
    if (error) return fail();
    if (
      patch.status &&
      patch.status !== cur.status &&
      (patch.status === "replied" || patch.status === "booked")
    ) {
      await supabase.from("activity").insert({
        owner_email: email,
        campaign_id: cur.campaign_id,
        prospect_id: cur.id,
        kind: patch.status,
        channel: text(b.channel, 20) || "email",
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "log_activity") {
    if (!KINDS.includes(b.kind)) return NextResponse.json({ error: "Bad kind." }, { status: 400 });
    const { data: cur } = await supabase
      .from("prospects")
      .select("id,campaign_id,status")
      .eq("id", b.prospectId)
      .eq("owner_email", email)
      .maybeSingle();
    if (!cur) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
    const { error } = await supabase.from("activity").insert({
      owner_email: email,
      campaign_id: cur.campaign_id,
      prospect_id: cur.id,
      kind: b.kind,
      channel: text(b.channel, 20) || "email",
    });
    if (error) return fail();
    const next = b.kind === "sent" ? "contacted" : b.kind;
    if (b.kind !== "sent" || cur.status === "new") {
      await supabase
        .from("prospects")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", cur.id)
        .eq("owner_email", email);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
