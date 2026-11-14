import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { REDIRECT, COOKIE } from "../../../gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  const res = NextResponse.redirect(
    "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString()
  );
  res.cookies.set("plyde_oauth_state", state, { ...COOKIE, maxAge: 600 });
  return res;
}
