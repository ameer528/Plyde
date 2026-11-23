import { NextResponse } from "next/server";
import { db, owner } from "../../db";
import { getRow, api } from "../../calcom";

export const dynamic = "force-dynamic";

function deny() {
  return NextResponse.json({ error: "Connect Gmail first." }, { status: 401 });
}

function bad(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function listEvents(email) {
  const r = await api(email, "/v2/event-types", {
    headers: { "cal-api-version": "2026-06-12" },
  });
  const list = r.ok && r.json && Array.isArray(r.json.data) ? r.json.data : [];
  return {
    ok: r.ok,
    status: r.status,
    events: list
      .filter((e) => e && e.bookingUrl && !e.hidden)
      .map((e) => ({
        name: String(e.title || "Meeting"),
        url: e.bookingUrl,
        minutes: e.lengthInMinutes,
      })),
  };
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
    const r = await listEvents(email);
    if (!r.ok) {
      out.error =
        r.status === 401
          ? "Your Cal.com connection expired. Please reconnect."
          : "Could not load your meeting types.";
      return NextResponse.json(out);
    }
    out.events = r.events;
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
      await api(email, "/v2/webhooks/" + row.webhook_uri, { method: "DELETE" });
    }
    await db()
      .from("integrations")
      .delete()
      .eq("owner_email", email)
      .eq("provider", "calcom");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "choose") {
    if (!row) return bad("Connect Cal.com first.");
    const r = await listEvents(email);
    const match = r.ok ? r.events.find((e) => e.url === b.url) : null;
    if (!match) return bad("That meeting type was not found.");
    const now = new Date().toISOString();
    await db()
      .from("integrations")
      .update({ booking_url: match.url, event_name: match.name, updated_at: now })
      .eq("owner_email", email)
      .eq("provider", "calcom");
    const { error } = await db()
      .from("profiles")
      .upsert(
        { owner_email: email, booking_link: match.url, updated_at: now },
        { onConflict: "owner_email" }
      );
    if (error) {
      return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}
