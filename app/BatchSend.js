"use client";

import { useState, useRef } from "react";
import { post } from "./ui";

const BATCH_MAX = 20;
const GAP_MIN = 45;
const GAP_MAX = 120;

function loadDraft(site) {
  try {
    return JSON.parse(localStorage.getItem("plyde_draft_" + site) || "null");
  } catch {
    return null;
  }
}

function savedName() {
  try {
    return localStorage.getItem("plyde_name") || "";
  } catch {
    return "";
  }
}

function fillName(text, name) {
  return name ? String(text).replace(/\[Your name\]/gi, name) : text;
}

function prepare(card, sentLog) {
  const email = card.drafts && card.drafts.email;
  if (!email) return null;
  const saved = loadDraft(card.site) || {};
  const myName = savedName();
  const found = card.emails && card.emails[0] ? card.emails[0].email : "";
  const to = String(saved.to !== undefined ? saved.to : found).trim();
  const subject =
    saved.subject !== undefined ? saved.subject : fillName(email.subject, myName);
  const body = saved.body !== undefined ? saved.body : fillName(email.body, myName);
  let state = "ready";
  let why = "Ready to send";
  const already = sentLog.some(
    (x) =>
      x.site === card.site ||
      (to && String(x.to || "").toLowerCase() === to.toLowerCase())
  );
  if (already) {
    state = "sent";
    why = "Already emailed";
  } else if (!to.includes("@")) {
    state = "no-email";
    why = "No email address found";
  } else if (/\[[^\]]+\]/.test(subject + " " + body)) {
    state = "edit";
    why = "Replace the [placeholders] in the card first";
  }
  return { site: card.site, to, subject, body, state, why, fit: card.fit_score || 0 };
}

export default function BatchSend({ cards, sentLog, gmail, onSent }) {
  const [picked, setPicked] = useState({});
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [, setTick] = useState(0);
  const stopRef = useRef(false);

  const rows = cards
    .map((c) => prepare(c, sentLog))
    .filter(Boolean)
    .sort((a, b) => b.fit - a.fit);
  const ready = rows.filter((r) => r.state === "ready");
  const chosen = ready.filter((r) => picked[r.site]);

  if (rows.length === 0) return null;

  function add(line) {
    setLines((p) => [...p, line]);
  }

  function toggle(site) {
    setPicked((p) => {
      const next = { ...p };
      if (next[site]) {
        delete next[site];
      } else if (Object.keys(next).filter((k) => next[k]).length < BATCH_MAX) {
        next[site] = true;
      }
      return next;
    });
  }

  function selectFirst() {
    const next = {};
    ready.slice(0, BATCH_MAX).forEach((r) => {
      next[r.site] = true;
    });
    setPicked(next);
  }

  async function run() {
    const list = chosen.slice(0, BATCH_MAX);
    if (!list.length) return;
    if (!gmail.connected) {
      add("Connect Gmail first.");
      return;
    }
    const ok = window.confirm(
      `Send ${list.length} email${list.length > 1 ? "s" : ""} from ${gmail.email || "your Gmail"}?\n\nThey go out one at a time, about 1 to 2 minutes apart. Keep this page open and your screen on until it finishes.`
    );
    if (!ok) return;

    stopRef.current = false;
    setRunning(true);
    setLines([]);
    let lock = null;
    try {
      if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen");
    } catch {}

    let sent = 0;
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) {
        add("Stopped. The rest were not sent.");
        break;
      }
      const r = list[i];
      const res = await post("/api/gmail/send", {
        to: r.to,
        subject: r.subject,
        body: r.body,
        approved: true,
      });
      if (res.ok) {
        sent++;
        onSent(r.site, r.to, r.subject);
        add(`Sent to ${r.to}`);
      } else {
        const err = (res.json && res.json.error) || "Could not send.";
        add(`Skipped ${r.to}: ${err}`);
        if (res.json && res.json.reconnect) {
          if (gmail.refresh) gmail.refresh();
          add("Stopped. Reconnect Gmail and try again.");
          break;
        }
        if (/daily limit/i.test(err)) {
          add("Stopped. Come back tomorrow for the rest.");
          break;
        }
      }
      if (i < list.length - 1) {
        const wait = GAP_MIN + Math.floor(Math.random() * (GAP_MAX - GAP_MIN));
        for (let s = wait; s > 0; s--) {
          if (stopRef.current) break;
          setCountdown(s);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        setCountdown(0);
      }
    }

    add(`Finished. ${sent} sent.`);
    try {
      if (lock) await lock.release();
    } catch {}
    setPicked({});
    setRunning(false);
  }

  const line = { margin: "6px 0", fontSize: "14px" };
  const rowStyle = {
    borderTop: "1px solid rgba(128,128,128,0.35)",
    padding: "12px 0",
  };

  return (
    <div style={{ marginTop: "40px" }}>
      <h2>Send a batch</h2>
      <p className="sub">
        Tick the emails you approve, up to {BATCH_MAX} at a time. Plyde sends them one by one,
        about 1 to 2 minutes apart, so your Gmail is not flagged. Keep this page open while it
        runs.
      </p>

      <div className="actions" style={{ marginBottom: "12px" }}>
        <button className="btn" disabled={running} onClick={selectFirst}>
          Select first {Math.min(BATCH_MAX, ready.length)} ready
        </button>
        <button className="btn" disabled={running} onClick={() => setTick((n) => n + 1)}>
          Refresh list
        </button>
      </div>

      {rows.map((r) => (
        <div key={r.site} style={rowStyle}>
          <label style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              disabled={running || r.state !== "ready"}
              checked={!!picked[r.site]}
              onChange={() => toggle(r.site)}
              style={{ marginTop: "4px" }}
            />
            <span>
              <b>{r.site}</b>
              <br />
              <span className="note-s">
                {r.to || "no address"} · {r.why}
              </span>
            </span>
          </label>
          {r.state === "ready" && (
            <details style={{ marginLeft: "28px" }}>
              <summary className="note-s">Preview</summary>
              <p style={{ ...line, fontWeight: 600 }}>{r.subject}</p>
              <p style={{ ...line, whiteSpace: "pre-wrap" }}>{r.body}</p>
            </details>
          )}
        </div>
      ))}

      <div className="actions" style={{ marginTop: "16px" }}>
        <button className="btn solid" disabled={running || chosen.length === 0} onClick={run}>
          {running ? "Sending..." : `Approve and send ${chosen.length}`}
        </button>
        {running && (
          <button className="btn" onClick={() => (stopRef.current = true)}>
            Stop
          </button>
        )}
      </div>

      {running && countdown > 0 && (
        <p className="note-s">Next email in {countdown}s. Keep this page open.</p>
      )}
      {lines.map((l, i) => (
        <p key={i} className="note-s" style={{ margin: "4px 0" }}>
          {l}
        </p>
      ))}
      <p className="note-s">
        Risky or invalid addresses are skipped automatically. An opt-out line is added to every
        email.
      </p>
    </div>
  );
    }
