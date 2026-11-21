import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "../../../db";
import { decrypt } from "../../../gmail";

export const dynamic = "force-dynamic";

function normHost(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function ok() {
  return NextResponse.json({ ok: true });
}

function denied() {
  return NextResponse.json({ error: "Not allowed." }, { status: 401 });
}

export async function POST(request) {
  const raw = await request.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const supabase = db();

  const { data: row } = await supabase
    .from("integrations")
    .select("owner_email,webhook_key_enc")
    .eq("provider", "calendly")
    .eq("user_uri", String(body.created_by || ""))
    .maybeSingle();
  if (!row || !row.webhook_key_enc) return ok();

  const key = decrypt(row.webhook_key_enc);
  const header = request.headers.get("calendly-webhook-signature") || "";
  const parts = {};
  header.split(",").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  if (!key || !parts.t || !parts.v1) return denied();

  const tNum = Number(parts.t);
  const ms = tNum > 1e12 ? tNum : tNum * 1000;
  if (!tNum || Math.abs(Date.now() - ms) > 5 * 60 * 1000) return denied();

  const expected = crypto.createHmac("sha256", key).update(parts.t + "." + raw).digest("hex");
  const a = Buffer.from(expected);
  const c = Buffer.from(parts.v1);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return denied();

  if (body.event !== "invitee.created") return ok();
  const invitee = String((body.payload && body.payload.email) || "").toLowerCase().trim();
  if (!invitee.includes("@")) return ok();
  const domain = invitee.split("@")[1];

  const { data: list } = await supabase
    .from("prospects")
    .select("id,campaign_id,site,emails,status")
    .eq("owner_email", row.owner_email)
    .limit(5000);

  const hit = (list || []).find((p) => {
    const mails = Array.isArray(p.emails) ? p.emails : [];
    const byEmail = mails.some(
      (m) => String((m && m.email) || m || "").toLowerCase() === invitee
    );
    return byEmail || normHost(p.site) === domain;
  });

  if (hit && hit.status !== "booked") {
    await supabase
      .from("prospects")
      .update({ status: "booked", updated_at: new Date().toISOString() })
      .eq("id", hit.id)
      .eq("owner_email", row.owner_email);
    await supabase.from("activity").insert({
      owner_email: row.owner_email,
      campaign_id: hit.campaign_id,
      prospect_id: hit.id,
      kind: "booked",
      channel: "email",
    });
  }
  return ok();
}
