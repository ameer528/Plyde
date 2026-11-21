import { NextResponse } from "next/server";
import { db, owner } from "../../db";
import { getRow, api } from "../../calendly";

export const dynamic = "force-dynamic";

function deny() {
  return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
}

function bad(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function listEvents(email, row) {
  const r = await api(
    email,
    "/event_types?active=true&count=50&user=" + encodeURIComponent(row.user_uri || "")
  );
  return r;
}

export async function GET(request) {
  const email = owner(request);
  if (!email) return deny();
  const row = await getRow(email);
  if (!row) return NextResponse.json({ connected: false });
  const out = {
    connected: true,
    bookingUrl: row.booking_url || "",
    eventName: row.event_name || "",
    tracking: !!row.webhook_uri,
    events: [],
  };
  if (new URL(request.url).searchParams.get("events")) {
    const r = await listEvents(email, row);
    if (!r.ok) {
      out.error =
        r.status === 401
          ? "Your Calendly connection expired. Please reconnect."
          : "Could not load your meeting types.";
      return NextResponse.json(out);
    }
    out.events = (r.json.collection || [])
      .map((e) => ({ name: e.name, url: e.scheduling_url, minutes: e.duration }))
      .filter((e) => e.url);
  }
  return NextResponse.json(out);
}

export async function POST(request) {
  const email = owner(request);
  if (!email) return deny();
  let b;
  try {
    b = await request.json();
  } catch {
    return bad("Bad request.");
  }
  const row = await getRow(email);

  if (b.action === "disconnect") {
    if (row && row.webhook_uri) {
      await api(email, row.webhook_uri.replace("https://api.calendly.com", ""), {
        method: "DELETE",
      });
    }
    await db()
      .from("integrations")
      .delete()
      .eq("owner_email", email)
      .eq("provider", "calendly");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "choose") {
    if (!row) return bad("Connect Calendly first.");
    const r = await listEvents(email, row);
    const match = r.ok
      ? (r.json.collection || []).find((e) => e.scheduling_url === b.url)
      : null;
    if (!match) return bad("That meeting type was not found.");
    const now = new Date().toISOString();
    await db()
      .from("integrations")
      .update({ booking_url: match.scheduling_url, event_name: match.name, updated_at: now })
      .eq("owner_email", email)
      .eq("provider", "calendly");
    const { error } = await db()
      .from("profiles")
      .upsert(
        { owner_email: email, booking_link: match.scheduling_url, updated_at: now },
        { onConflict: "owner_email" }
      );
    if (error) {
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}
