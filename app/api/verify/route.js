import { NextResponse } from "next/server";
import { verifyEmail } from "../../verify";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const result = await verifyEmail(b.email);
  return NextResponse.json(result);
}
