import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, owner } from "../../../db";
import { decrypt, encrypt } from "../../../gmail";
import { SITE, REDIRECT, saveTokens, getRow, api } from "../../../calendly";

export const dynamic = "force-dynamic";

function back(flag) {
  return NextResponse.redirect(SITE + "/profile?calendly=" + flag);
}

function log(step, detail) {
  console.error("calendly-callback:", step, detail === undefined ? "" : detail);
}

async function exchange(code) {
  const id = process.env.CALENDLY_CLIENT_ID || "";
  const secret = process.env.CALENDLY_CLIENT_SECRET || "";
  log("env", { hasId: !!id, hasSecret: !!secret, idLen: id.length, secretLen: secret.length });
  try {
    const res = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
      }),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    if (!res.ok) {
      log("token-exchange-failed", {
        status: res.status,
        error: json.error,
        description: json.error_description,
        redirect_used: REDIRECT,
      });
      return null;
    }
    return json;
  } catch (e) {
    log("token-exchange-exception", String(e && e.message ? e.message : e));
    return null;
  }
}

export async function GET(request) {
  const email = owner(request);
  if (!email) {
    log("no-gmail-session");
    return NextResponse.redirect(SITE + "/");
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) {
    log("denied-or-no-code", {
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
    log("bad-state", { hasState: !!st, sameEmail: !!st && st.e === email });
    return back("failed");
  }

  const old = await getRow(email);
  const tok = await exchange(code);
  if (!tok || !tok.access_token || !tok.refresh_token) {
    log("no-tokens", { gotToken: !!tok });
    return back("failed");
  }

  const saved = await saveTokens(email, tok, {});
  if (saved.error) {
    log("save-tokens-failed", saved.error.message);
    return back("failed");
  }

  const me = await api(email, "/users/me");
  const user = me.json && me.json.resource;
  if (!me.ok || !user) {
    log("users-me-failed", { status: me.status, title: me.json && me.json.title });
    return back("failed");
  }

  if (old && old.webhook_uri) {
    await api(email, old.webhook_uri.replace("https://api.calendly.com", ""), {
      method: "DELETE",
    });
  }

  let webhookUri = null;
  let keyEnc = null;
  const key = crypto.randomBytes(24).toString("hex");
  const hook = await api(email, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: SITE + "/api/calendly/webhook",
      events: ["invitee.created"],
      organization: user.current_organization,
      user: user.uri,
      scope: "user",
      signing_key: key,
    }),
  });
  if (hook.ok && hook.json.resource) {
    webhookUri = hook.json.resource.uri;
    keyEnc = encrypt(key);
  } else {
    log("webhook-failed", {
      status: hook.status,
      title: hook.json && hook.json.title,
      message: hook.json && hook.json.message,
    });
  }

  await db()
    .from("integrations")
    .update({
      user_uri: user.uri,
      org_uri: user.current_organization,
      webhook_uri: webhookUri,
      webhook_key_enc: keyEnc,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_email", email)
    .eq("provider", "calendly");

  return back("connected");
}
