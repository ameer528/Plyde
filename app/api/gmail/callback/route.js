import { NextResponse } from "next/server";
import { SITE, REDIRECT, COOKIE, encrypt } from "../../../gmail";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const back = (q) => NextResponse.redirect(`${SITE}/?gmail=${q}`);

  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = request.cookies.get("plyde_oauth_state")?.value;
  if (!code || !state || !saved || state !== saved) return back("failed");

  let tokens;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return back("failed");
    tokens = await tokenRes.json();
  } catch {
    return back("failed");
  }

  if (!tokens.refresh_token) return back("failed");
  if (!String(tokens.scope || "").includes("gmail.send")) return back("denied");

  let email = "";
  try {
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (info.ok) email = (await info.json()).email || "";
  } catch {}

  const value = encrypt(JSON.stringify({ rt: tokens.refresh_token, email }));
  const res = back("connected");
  res.cookies.set("plyde_gmail", value, { ...COOKIE, maxAge: 60 * 60 * 24 * 30 });
  res.cookies.set("plyde_oauth_state", "", { ...COOKIE, maxAge: 0 });
  return res;
      }
