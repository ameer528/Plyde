import { db } from "./db";
import { encrypt, decrypt } from "./gmail";

const AUTH = "https://auth.calendly.com";
const API = "https://api.calendly.com";
export const SITE = "https://plyde.vercel.app";
export const REDIRECT = SITE + "/api/calendly/callback";
const SCOPES = "users:read event_types:read scheduled_events:read webhooks:write";

function basic() {
  const id = process.env.CALENDLY_CLIENT_ID || "";
  const secret = process.env.CALENDLY_CLIENT_SECRET || "";
  return "Basic " + Buffer.from(id + ":" + secret).toString("base64");
}

export function authUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.CALENDLY_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: REDIRECT,
    scope: SCOPES,
    state,
  });
  return AUTH + "/oauth/authorize?" + q.toString();
}

export async function tokenRequest(params) {
  try {
    const res = await fetch(AUTH + "/oauth/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: basic(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveTokens(email, tok, extra) {
  const row = {
    owner_email: email,
    provider: "calendly",
    access_enc: encrypt(tok.access_token),
    refresh_enc: encrypt(tok.refresh_token),
    expires_at: new Date(
      Date.now() + (Number(tok.expires_in) || 7200) * 1000 - 60000
    ).toISOString(),
    updated_at: new Date().toISOString(),
    ...(extra || {}),
  };
  return db().from("integrations").upsert(row, { onConflict: "owner_email,provider" });
}

export async function getRow(email) {
  const { data } = await db()
    .from("integrations")
    .select("*")
    .eq("owner_email", email)
    .eq("provider", "calendly")
    .maybeSingle();
  return data || null;
}

export async function accessToken(email) {
  const row = await getRow(email);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() > Date.now()) return decrypt(row.access_enc);
  const refresh = decrypt(row.refresh_enc);
  if (!refresh) return null;
  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!tok || !tok.access_token) return null;
  await saveTokens(email, { ...tok, refresh_token: tok.refresh_token || refresh }, {});
  return tok.access_token;
}

export async function api(email, path, init) {
  const token = await accessToken(email);
  if (!token) return { ok: false, status: 401, json: {} };
  try {
    const res = await fetch(API + path, {
      ...(init || {}),
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: {} };
  }
      }
