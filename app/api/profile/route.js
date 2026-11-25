import { NextResponse } from "next/server";
import { db, owner } from "../../db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const email = owner(request);
  if (!email) return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
  const { data, error } = await db()
    .from("profiles")
    .select("name,booking_link,website,description,daily_limit")
    .eq("owner_email", email)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  return NextResponse.json({
    name: data?.name || "",
    bookingLink: data?.booking_link || "",
    website: data?.website || "",
    description: data?.description || "",
    dailyLimit: data?.daily_limit || 20,
  });
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
  if (b.website !== undefined) patch.website = String(b.website).trim().slice(0, 300);
  if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 2000);
  if (b.bookingLink !== undefined) {
    const link = String(b.bookingLink).trim().slice(0, 300);
    if (link && !/^https:\/\/\S+$/i.test(link)) {
      return NextResponse.json(
        { error: "The booking link must start with https:// and have no spaces." },
        { status: 400 }
      );
    }
    patch.booking_link = link;
  }
  if (b.dailyLimit !== undefined) {
    const n = Math.round(Number(b.dailyLimit));
    if (!(n >= 1)) {
      return NextResponse.json({ error: "The daily limit must be at least 1." }, { status: 400 });
    }
    patch.daily_limit = Math.min(50, n);
  }
  const { error } = await db().from("profiles").upsert(patch, { onConflict: "owner_email" });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
    }
