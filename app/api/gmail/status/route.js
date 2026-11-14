import { NextResponse } from "next/server";
import { readSession, COOKIE } from "../../../gmail";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, email: session.email || "" });
}

export async function DELETE() {
  const res = NextResponse.json({ connected: false });
  res.cookies.set("plyde_gmail", "", { ...COOKIE, maxAge: 0 });
  return res;
}
