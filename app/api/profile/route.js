import { NextResponse } from "next/server";
import { db, owner } from "../../db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const email = owner(request);
  if (!email) return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
  const { data, error } = await db()
    .from("profiles")
    .select("name,booking_link")
    .eq("owner_email", email)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  return NextResponse.json({ name: data?.name || "", bookingLink: data?.booking_link || "" });
}

export async function POST(request) {
  const email = owner(request);
  if (!email) return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const patch = { owner_email: email, updated_at: new Date().toISOString() };
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 60);
  if (b.bookingLink !== undefined) patch.booking_link = String(b.bookingLink).trim().slice(0, 300);
  const { error } = await db().from("profiles").upsert(patch, { onConflict: "owner_email" });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
    }
