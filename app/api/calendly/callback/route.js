import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, owner } from "../../../db";
import { decrypt, encrypt } from "../../../gmail";
import { SITE, REDIRECT, tokenRequest, saveTokens, getRow, api } from "../../../calendly";

export const dynamic = "force-dynamic";

function back(flag) {
  return NextResponse.redirect(SITE + "/profile?calendly=" + flag);
}

export async function GET(request) {
  const email = owner(request);
  if (!email) return NextResponse.redirect(SITE + "/");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return back("denied");

  let st = null;
  try {
    st = JSON.parse(decrypt(url.searchParams.get("state") || "") || "null");
  } catch {}
  if (!st || st.e !== email || Date.now() - Number(st.t) > 15 * 60 * 1000) {
    return back("failed");
  }

  const old = await getRow(email);
  const tok = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
  });
  if (!tok || !tok.access_token || !tok.refresh_token) return back("failed");
  const saved = await saveTokens(email, tok, {});
  if (saved.error) return back("failed");

  const me = await api(email, "/users/me");
  const user = me.json && me.json.resource;
  if (!me.ok || !user) return back("failed");

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
