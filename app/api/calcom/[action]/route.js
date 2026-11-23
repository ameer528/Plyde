import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, owner } from "../../../db";
import { decrypt, encrypt } from "../../../gmail";
import { SITE, REDIRECT, authUrl, tokenRequest, saveTokens, getRow, api } from "../../../calcom";

export const dynamic = "force-dynamic";

function back(flag) {
  return NextResponse.redirect(SITE + "/profile?calcom=" + flag);
}

function log(step, detail) {
  console.error("calcom:", step, detail === undefined ? "" : detail);
}

function ok() {
  return NextResponse.json({ ok: true });
}

function normHost(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

export async function GET(request, { params }) {
  const { action } = await params;
  const email = owner(request);

  if (action === "connect") {
    if (!email) return NextResponse.redirect(SITE + "/");
    const state = encrypt(JSON.stringify({ e: email, t: Date.now() }));
    return NextResponse.redirect(authUrl(state));
  }

  if (action === "callback") {
    if (!email) return NextResponse.redirect(SITE + "/");
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (url.searchParams.get("error") || !code) {
      log("denied", {
        error: url.searchParams.get("error"),
        description: url.searchParams.get("error_description"),
      });
      return back("denied");
    }

    let st = null;
    try {
      st = JSON.parse(decrypt(url.searchParams.get("state") || "") || "null");
    } catch {}
    if (!st || st.e !== email || Date.now() - Number(st.t) > 15 * 60 * 1000) {
      log("bad-state");
      return back("failed");
    }

    const old = await getRow(email);
    const tok = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
    });
    if (!tok || !tok.access_token || !tok.refresh_token) {
      log("no-tokens", { gotToken: !!tok });
      return back("failed");
    }
    const saved = await saveTokens(email, tok, {});
    if (saved.error) {
      log("save-tokens-failed", saved.error.message);
      return back("failed");
    }

    if (old && old.webhook_uri) {
      await api(email, "/v2/webhooks/" + old.webhook_uri, { method: "DELETE" });
    }

    const hookId = crypto.randomBytes(12).toString("hex");
    const secret = crypto.randomBytes(24).toString("hex");
    const hook = await api(email, "/v2/webhooks", {
      method: "POST",
      body: JSON.stringify({
        active: true,
        subscriberUrl: SITE + "/api/calcom/webhook?h=" + hookId,
        triggers: ["BOOKING_CREATED"],
        secret,
      }),
    });
    const hookData = hook.json && (hook.json.data || hook.json);
    let webhookId = null;
    let keyEnc = null;
    let ext = null;
    if (hook.ok && hookData && hookData.id !== undefined) {
      webhookId = String(hookData.id);
      keyEnc = encrypt(secret);
      ext = hookId;
    } else {
      log("webhook-failed", {
        status: hook.status,
        message: hook.json && (hook.json.message || hook.json.error),
      });
    }

    await db()
      .from("integrations")
      .update({
        user_uri: ext,
        webhook_uri: webhookId,
        webhook_key_enc: keyEnc,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_email", email)
      .eq("provider", "calcom");

    return back("connected");
  }

  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST(request, { params }) {
  const { action } = await params;
  if (action !== "webhook") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const raw = await request.text();
  const hook = new URL(request.url).searchParams.get("h") || "";
  if (!hook) return ok();
  const supabase = db();

  const { data: row } = await supabase
    .from("integrations")
    .select("owner_email,webhook_key_enc")
    .eq("provider", "calcom")
    .eq("user_uri", hook)
    .maybeSingle();
  if (!row || !row.webhook_key_enc) return ok();

  const key = decrypt(row.webhook_key_enc);
  const sig = (request.headers.get("x-cal-signature-256") || "").trim();
  const expected = key
    ? crypto.createHmac("sha256", key).update(raw).digest("hex")
    : "";
  const a = Buffer.from(expected);
  const c = Buffer.from(sig);
  if (!key || !sig || a.length !== c.length || !crypto.timingSafeEqual(a, c)) {
    log("webhook-bad-signature", { hasSig: !!sig });
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || body.triggerEvent !== "BOOKING_CREATED") return ok();

  const attendees = Array.isArray(body.payload && body.payload.attendees)
    ? body.payload.attendees
    : [];
  const emails = attendees
    .map((x) => String((x && x.email) || "").toLowerCase().trim())
    .filter((x) => x.includes("@"));
  log("webhook-booking", { attendees: emails.length });
  if (!emails.length) return ok();

  const { data: list } = await supabase
    .from("prospects")
    .select("id,campaign_id,site,emails,status")
    .eq("owner_email", row.owner_email)
    .limit(5000);

  const hit = (list || []).find((p) => {
    const mails = Array.isArray(p.emails) ? p.emails : [];
    return emails.some((invitee) => {
      const domain = invitee.split("@")[1];
      return (
        mails.some((m) => String((m && m.email) || m || "").toLowerCase() === invitee) ||
        normHost(p.site) === domain
      );
    });
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
