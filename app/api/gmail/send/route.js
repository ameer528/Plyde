import { NextResponse } from "next/server";
import { readSession, COOKIE } from "../../../gmail";

export const dynamic = "force-dynamic";

const DAILY_LIMIT = 20;
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;
const OPT_OUT = '\n\n--\nNot interested? Just reply "no thanks" and I will not contact you again.';

function oneLine(value, max) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export async function POST(request) {
  let b;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (b.approved !== true) {
    return NextResponse.json({ error: "Sending needs your approval." }, { status: 400 });
  }

  const session = readSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Connect Gmail first.", reconnect: true },
      { status: 401 }
    );
  }

  const to = oneLine(b.to, 254);
  const subject = oneLine(b.subject, 200);
  const text = String(b.body || "").slice(0, 5000).trim();

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "That recipient email does not look valid." }, { status: 400 });
  }
  if (!subject || !text) {
    return NextResponse.json({ error: "The subject and message cannot be empty." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  try {
    const c = JSON.parse(request.cookies.get("plyde_sent")?.value || "{}");
    if (c.d === today) count = Number(c.n) || 0;
  } catch {}
  if (count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit of ${DAILY_LIMIT} emails reached. Try again tomorrow.` },
      { status: 429 }
    );
  }

  let accessToken;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: session.rt,
        grant_type: "refresh_token",
      }),
    });
    if (!tokenRes.ok) {
      if (tokenRes.status === 400 || tokenRes.status === 401) {
        const res = NextResponse.json(
          { error: "Your Gmail connection expired. Please reconnect.", reconnect: true },
          { status: 401 }
        );
        res.cookies.set("plyde_gmail", "", { ...COOKIE, maxAge: 0 });
        return res;
      }
      return NextResponse.json({ error: "Google is not responding. Try again." }, { status: 502 });
    }
    accessToken = (await tokenRes.json()).access_token;
  } catch {
    return NextResponse.json({ error: "Could not reach Google. Try again." }, { status: 502 });
  }

  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const bodyEncoded = Buffer.from(text + OPT_OUT, "utf8")
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n");
  const message = [
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyEncoded,
  ].join("\r\n");
  const raw = Buffer.from(message).toString("base64url");

  try {
    const send = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!send.ok) {
      let reason = "";
      try {
        reason = String((await send.json())?.error?.message || "").slice(0, 150);
      } catch {}
      return NextResponse.json(
        { error: "Gmail could not send this message." + (reason ? " (" + reason + ")" : "") },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Gmail did not respond. Try again." }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true, remainingToday: DAILY_LIMIT - count - 1 });
  res.cookies.set("plyde_sent", JSON.stringify({ d: today, n: count + 1 }), {
    ...COOKIE,
    maxAge: 60 * 60 * 48,
  });
  return res;
                         }
