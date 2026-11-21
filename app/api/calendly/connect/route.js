import { NextResponse } from "next/server";
import { owner } from "../../../db";
import { encrypt } from "../../../gmail";
import { authUrl, SITE } from "../../../calendly";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const email = owner(request);
  if (!email) return NextResponse.redirect(SITE + "/");
  const state = encrypt(JSON.stringify({ e: email, t: Date.now() }));
  return NextResponse.redirect(authUrl(state));
}
