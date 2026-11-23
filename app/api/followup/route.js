import { NextResponse } from "next/server";
import { askAI } from "../../ai";
import { db, owner } from "../../db";
import { checkLimit } from "../../usage";

export const dynamic = "force-dynamic";

const WAIT_DAYS = 3;
const MAX_SENDS = 3;

function deny() {
  return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
}

function clean(value, max) {
  return String(value || "").slice(0, max);
}

export async function GET(request) {
  const email = owner(request);
  if (!email) return deny();
  const supabase = db();

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id,campaign_id,site,emails,status")
    .eq("owner_email", email)
    .eq("status", "contacted")
    .limit(500);
  if (error) {
    return NextResponse.json({ error: "Could not load follow-ups." }, { status: 500 });
  }
  const list = prospects || [];
  if (list.length === 0) return NextResponse.json({ due: [], waiting: 0 });

  const { data: acts } = await supabase
    .from("activity")
    .select("prospect_id,created_at")
    .eq("owner_email", email)
    .eq("kind", "sent")
    .limit(5000);

  const stats = {};
  for (const a of acts || []) {
    const s = stats[a.prospect_id] || (stats[a.prospect_id] = { n: 0, last: 0 });
    s.n++;
    const t = new Date(a.created_at).getTime();
    if (t > s.last) s.last = t;
  }

  const cutoff = Date.now() - WAIT_DAYS * 86400000;
  const due = [];
  let waiting = 0;
  for (const p of list) {
    const s = stats[p.id];
    if (!s || s.n >= MAX_SENDS) continue;
    const first = Array.isArray(p.emails) && p.emails[0] ? p.emails[0] : null;
    const to = String((first && first.email) || first || "").trim();
    if (!to.includes("@")) continue;
    if (s.last <= cutoff) {
      due.push({
        id: p.id,
        campaignId: p.campaign_id,
        site: p.site,
        to,
        sends: s.n,
        lastSent: new Date(s.last).toISOString(),
      });
    } else {
      waiting++;
    }
  }
  due.sort((a, b) => a.lastSent.localeCompare(b.lastSent));
  return NextResponse.json({ due: due.slice(0, 50), waiting });
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

  const lim = await checkLimit(request, "followup", 0, 300);
  if (!lim.allowed) {
    return NextResponse.json({ error: "Too many requests today." }, { status: 429 });
  }

  const { data: p } = await supabase
    .from("prospects")
    .select("id,campaign_id,site,company_summary,status")
    .eq("id", clean(b.prospectId, 80))
    .eq("owner_email", email)
    .maybeSingle();
  if (!p) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  if (p.status !== "contacted") {
    return NextResponse.json(
      { error: "This prospect already replied, booked or was closed." },
      { status: 400 }
    );
  }

  const { data: camp } = await supabase
    .from("campaigns")
    .select("summary")
    .eq("id", p.campaign_id)
    .eq("owner_email", email)
    .maybeSingle();

  let name = "";
  try {
    const { data } = await supabase
      .from("profiles")
      .select("name")
      .eq("owner_email", email)
      .maybeSingle();
    name = (data && data.name) || "";
  } catch {}

  const { count } = await supabase
    .from("activity")
    .select("id", { count: "exact", head: true })
    .eq("prospect_id", p.id)
    .eq("owner_email", email)
    .eq("kind", "sent");
  const sent = Number(count) || 1;
  const last = sent >= 2;

  const prompt = `You help a freelancer or small agency owner write a follow-up email to a prospect who has not replied to their first cold email.

What the sender offers: ${clean(camp && camp.summary, 600) || "(not given)"}
The prospect's company: ${clean(p.site, 100)}
What is known about it: ${clean(p.company_summary, 500) || "(not given)"}
The sender's name: ${name || "[Your name]"}
This is follow-up number ${sent}${last ? " and it is the LAST one." : "."}

Rules:
- Under 70 words, plain and human, no hype, no emojis, no guilt or pressure.
- Do not repeat the whole pitch. Add one small new angle or a simple question.
- Never claim they opened or read the earlier email. Never invent facts, results, clients or prices.
${last ? "- Close the loop politely: say this is the last note, and that they can reply any time." : "- End with one easy, low-pressure question."}
- Do not include any booking link. It is added automatically.
- Sign off with the sender's name.

Return ONLY valid JSON: {"subject": "short subject line", "body": "the email text"}`;

  const answer = await askAI(prompt);
  if (answer.error || !answer.result) {
    return NextResponse.json(
      { error: answer.error || "Could not write the follow-up." },
      { status: 502 }
    );
  }
  return NextResponse.json({
    subject: clean(answer.result.subject, 150) || "Following up",
    body: clean(answer.result.body, 2000),
    followUpNumber: sent,
  });
    }
