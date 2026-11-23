
import { NextResponse } from "next/server";
import { verifyEmail } from "../../verify";
import { owner } from "../../db";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!owner(request)) {
    return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
  }
  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const result = await verifyEmail(b.email);
  return NextResponse.json(result);
}
