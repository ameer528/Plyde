"use client";

import { useState, useEffect } from "react";
import { post } from "./ui";

const INTENT = {
  interested: "Interested",
  wants_call: "Wants a call",
  question: "Has a question",
  not_now: "Not right now",
  not_interested: "Not interested",
  unsubscribe: "Asked to stop",
  out_of_office: "Out of office",
  other: "Other",
};

function savedName() {
  try {
    return localStorage.getItem("plyde_name") || "";
  } catch {
    return "";
  }
}

export default function ReplyHelper({ sentLog }) {
  const [site, setSite] = useState("");
  const [theirs, setTheirs] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.bookingLink) setLink(j.bookingLink);
      })
      .catch(() => {});
  }, []);

  const contacts = [];
  const seen = new Set();
  for (const x of sentLog || []) {
    if (!seen.has(x.site)) {
      seen.add(x.site);
      contacts.push(x);
    }
  }
  if (contacts.length === 0) return null;
  const current = contacts.find((c) => c.site === site) || contacts[0];

  async function saveLink() {
    setMsg("");
    const r = await post("/api/profile", { bookingLink: link.trim() });
    setMsg(r.ok ? "Booking link saved." : "Could not save the link.");
  }

  async function analyze() {
    setMsg("");
    setRes(null);
    setDraft("");
    if (!theirs.trim()) {
      setMsg("Paste their message first.");
      return;
    }
    setBusy(true);
    const r = await post("/api/reply", {
      site: current.site,
      theirMessage: theirs,
      myMessage: current.subject,
    });
    setBusy(false);
    if (!r.ok) {
      setMsg((r.json && r.json.error) || "Something went wrong. Try again.");
      return;
    }
    setRes(r.json);
    const name = savedName();
    setDraft(name ? String(r.json.reply || "").replace(/\[Your name\]/gi, name) : r.json.reply || "");
  }

  async function mark(status, text) {
    const r = await post("/api/reply", { action: "mark", site: current.site, status });
    setMsg(r.ok ? text : "Could not update this prospect.");
  }

  async function send() {
    setMsg("");
    if (!draft.trim()) return;
    if (/\[[^\]]+\]/.test(draft)) {
      setMsg("Replace the [placeholders] in the message before sending.");
      return;
    }
    if (!window.confirm(`Send this reply to ${current.to}?`)) return;
    setSending(true);
    const r = await post("/api/gmail/send", {
      to: current.to,
      subject: "Re: " + String(current.subject || "").replace(/^re:\s*/i, ""),
      body: draft,
      approved: true,
    });
    setSending(false);
    if (r.ok) {
      await post("/api/reply", { action: "mark", site: current.site, status: "replied" });
      setMsg("Sent. Marked as replied.");
      setRes(null);
      setDraft("");
      setTheirs("");
    } else {
      setMsg((r.json && r.json.error) || "Could not send.");
    }
  }

  const noPitch =
    res && ["not_interested", "unsubscribe", "out_of_office"].includes(res.intent);

  return (
    <div style={{ marginTop: "48px" }}>
      <h2>Reply to a prospect</h2>
      <p className="sub">
        When someone answers, pick the company, paste their message, and Plyde writes your reply.
        You edit it and approve it before anything is sent.
      </p>

      <label className="lbl">Your booking link (Cal.com or similar)</label>
      <input
        className="in"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://cal.com/your-name"
      />
      <div className="actions" style={{ marginBottom: "16px" }}>
        <button className="btn" onClick={saveLink}>
          Save link
        </button>
      </div>

      <label className="lbl">Who replied?</label>
      <select className="in" value={current.site} onChange={(e) => setSite(e.target.value)}>
        {contacts.map((c) => (
          <option key={c.site} value={c.site}>
            {c.site} ({c.to})
          </option>
        ))}
      </select>

      <label className="lbl">Their message</label>
      <textarea
        className="ta"
        rows={6}
        value={theirs}
        onChange={(e) => setTheirs(e.target.value)}
        placeholder="Paste what they wrote here"
      />
      <div className="actions">
        <button className="btn solid" disabled={busy} onClick={analyze}>
          {busy ? "Reading..." : "Write my reply"}
        </button>
      </div>

      {res && (
        <div style={{ marginTop: "16px" }}>
          <p>
            <b>{INTENT[res.intent] || "Other"}</b>
            {res.summary ? ": " + res.summary : ""}
          </p>

          {noPitch ? (
            <>
              <p className="note-s">
                {res.intent === "out_of_office"
                  ? "This is an automatic reply. Try again in a week."
                  : "They said no or asked you to stop. Do not email them again."}
              </p>
              {res.intent !== "out_of_office" && (
                <div className="actions">
                  <button className="btn" onClick={() => mark("lost", "Marked as lost.")}>
                    Mark as lost
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {!res.hasLink && (res.intent === "wants_call" || res.intent === "interested") && (
                <p className="note-s">
                  Add your booking link above and write the reply again to include it.
                </p>
              )}
              <label className="lbl">Your reply (edit it)</label>
              <textarea
                className="ta"
                rows={8}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="actions">
                <button className="btn solid" disabled={sending} onClick={send}>
                  {sending ? "Sending..." : "Approve and send"}
                </button>
                <button className="btn" onClick={() => mark("booked", "Marked as booked.")}>
                  They booked a call
                </button>
                <button className="btn" onClick={() => mark("lost", "Marked as lost.")}>
                  Mark as lost
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}
