"use client";

import { useEffect, useState } from "react";
import { post } from "./ui";

function savedName() {
  try {
    return localStorage.getItem("plyde_name") || "";
  } catch {
    return "";
  }
}

function daysAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  return d === 1 ? "1 day ago" : d + " days ago";
}

export default function FollowUps() {
  const [due, setDue] = useState(null);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/followup");
      const j = await r.json();
      if (r.ok) {
        setDue(j.due || []);
        setWaiting(j.waiting || 0);
      } else {
        setDue([]);
      }
    } catch {
      setDue([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function drop(id) {
    setDue((list) => (list || []).filter((x) => x.id !== id));
    setOpen(null);
  }

  async function write(item) {
    setMsg("");
    setBusy(item.id);
    const r = await post("/api/followup", { prospectId: item.id });
    setBusy("");
    if (!r.ok) {
      setMsg((r.json && r.json.error) || "Could not write the follow-up.");
      return;
    }
    const name = savedName();
    const fill = (t) =>
      name ? String(t || "").replace(/\[Your name\]/gi, name) : String(t || "");
    setOpen({ id: item.id, subject: fill(r.json.subject), body: fill(r.json.body) });
  }

  async function send(item) {
    if (!open) return;
    setMsg("");
    if (/\[[^\]]+\]/.test(open.subject + " " + open.body)) {
      setMsg("Replace the [placeholders] in the message before sending.");
      return;
    }
    if (!window.confirm(`Send this follow-up to ${item.to}?`)) return;
    setBusy(item.id);
    const payload = { to: item.to, subject: open.subject, body: open.body, approved: true };
    let r = await post("/api/gmail/send", payload);
    if (!r.ok && r.json && r.json.risky) {
      if (window.confirm((r.json.error || "Risky address.") + "\n\nSend anyway?")) {
        r = await post("/api/gmail/send", { ...payload, allowRisky: true });
      }
    }
    if (r.ok) {
      await post("/api/track", {
        action: "log_activity",
        campaignId: item.campaignId,
        prospectId: item.id,
        kind: "sent",
        channel: "email",
      });
      setMsg("Sent to " + item.to + ".");
      drop(item.id);
    } else {
      setMsg((r.json && r.json.error) || "Could not send.");
    }
    setBusy("");
  }

  async function lost(item) {
    setBusy(item.id);
    const r = await post("/api/track", {
      action: "update_prospect",
      id: item.id,
      status: "lost",
    });
    setBusy("");
    if (r.ok) drop(item.id);
    else setMsg("Could not update this prospect.");
  }

  if (due === null) return null;
  if (due.length === 0 && waiting === 0) return null;

  return (
    <div className="plat" style={{ marginTop: "24px" }}>
      <h3>Follow-ups due ({due.length})</h3>
      <p className="note-s">
        People who haven't replied 3 days after your last email. You approve every message, and
        Plyde stops after two follow-ups.
      </p>
      {due.length === 0 && (
        <p className="note-s">Nothing is due yet. {waiting} waiting for day 3.</p>
      )}
      {due.map((item) => (
        <div
          key={item.id}
          style={{ borderTop: "1px solid rgba(128,128,128,0.35)", padding: "12px 0" }}
        >
          <p style={{ margin: "0 0 4px" }}>
            <b>{item.site}</b>
          </p>
          <p className="note-s" style={{ margin: "0 0 8px" }}>
            {item.to} · last emailed {daysAgo(item.lastSent)} · {item.sends} sent so far
          </p>

          {open && open.id === item.id ? (
            <>
              <label className="lbl">Subject</label>
              <input
                className="in"
                value={open.subject}
                onChange={(e) => setOpen({ ...open, subject: e.target.value })}
              />
              <label className="lbl">Message</label>
              <textarea
                className="ta"
                rows={7}
                value={open.body}
                onChange={(e) => setOpen({ ...open, body: e.target.value })}
              />
              <div className="actions">
                <button
                  className="btn solid"
                  disabled={busy === item.id}
                  onClick={() => send(item)}
                >
                  {busy === item.id ? "Sending..." : "Approve and send"}
                </button>
                <button className="btn" onClick={() => setOpen(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="actions">
              <button
                className="btn solid"
                disabled={busy === item.id}
                onClick={() => write(item)}
              >
                {busy === item.id ? "Writing..." : "Write follow-up"}
              </button>
              <button className="btn" disabled={busy === item.id} onClick={() => lost(item)}>
                Mark as lost
              </button>
            </div>
          )}
        </div>
      ))}
      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}
