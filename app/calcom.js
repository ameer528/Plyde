import { db } from "./db";
import { encrypt, decrypt } from "./gmail";

const AUTH = "https://app.cal.com/auth/oauth2/authorize";
const API = "https://api.cal.com";
export const SITE = "https://plyde.vercel.app";
export const REDIRECT = SITE + "/api/calcom/callback";
const SCOPES = "EVENT_TYPE_READ,WEBHOOK_WRITE";

export function authUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.CALCOM_CLIENT_ID || "",
    redirect_uri: REDIRECT,
    state,
    scope: SCOPES,
  });
  return AUTH + "?" + q.toString();
}

export async function tokenRequest(params) {
  try {
    const res = await fetch(API + "/v2/auth/oauth2/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.CALCOM_CLIENT_ID || "",
        client_secret: process.env.CALCOM_CLIENT_SECRET || "",
        ...params,
      }),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    if (!res.ok) {
      console.error("calcom-token-failed:", res.status, json.error, json.error_description);
      return null;
    }
    return json.access_token ? json : json.data || json;
  } catch (e) {
    console.error("calcom-token-exception:", String(e && e.message ? e.message : e));
    return null;
  }
}

export async function saveTokens(email, tok, extra) {
  const row = {
    owner_email: email,
    provider: "calcom",
    access_enc: encrypt(tok.access_token),
    refresh_enc: encrypt(tok.refresh_token),
    expires_at: new Date(
      Date.now() + (Number(tok.expires_in) || 1800) * 1000 - 60000
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
    .eq("provider", "calcom")
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
        ...((init && init.headers) || {}),
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
