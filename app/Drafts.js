"use client";

import { useState, useEffect } from "react";
import { LABELS, post } from "./ui";

function loadDraft(site) {
  try {
    return JSON.parse(localStorage.getItem("plyde_draft_" + site) || "null");
  } catch {
    return null;
  }
}

function EmailBox({ d, gmail, copy, copied, onSent, sentInfo }) {
  const email = d.drafts.email;
  const [init] = useState(() => loadDraft(d.site) || {});
  const [to, setTo] = useState(
    init.to !== undefined ? init.to : d.emails && d.emails[0] ? d.emails[0].email : ""
  );
  const [subject, setSubject] = useState(init.subject !== undefined ? init.subject : email.subject);
  const [body, setBody] = useState(init.body !== undefined ? init.body : email.body);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("plyde_draft_" + d.site, JSON.stringify({ to, subject, body }));
    } catch {}
  }, [to, subject, body, d.site]);

  async function send() {
    setMsg("");
    if (!to.trim()) {
      setMsg("Add the recipient's email first.");
      return;
    }
    if (/\[[^\]]+\]/.test(subject + " " + body)) {
      setMsg("Replace the [placeholders], like [First name] and [Your name], before sending.");
      return;
    }
    const ok = window.confirm(
      `Send this email to ${to.trim()} from ${gmail.email || "your Gmail"}?`
    );
    if (!ok) return;
    setSending(true);
    const r = await post("/api/gmail/send", {
      to: to.trim(),
      subject,
      body,
      approved: true,
    });
    setSending(false);
    if (r.ok) {
      setMsg("Sent.");
      onSent(d.site, to.trim(), subject);
    } else {
      setMsg(r.json.error || "Could not send.");
      if (r.json.reconnect) gmail.refresh();
    }
  }

  return (
    <details className="draft" open>
      <summary>Email</summary>
      <div className="draft-body">
        <label className="lbl">To</label>
        <input
          className="in"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient email (none found publicly)"
        />
        <label className="lbl">Subject</label>
        <input className="in" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="lbl">Message</label>
        <textarea className="ta" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="actions">
          {gmail.connected ? (
            <button className="btn solid" disabled={sending} onClick={send}>
              {sending ? "Sending..." : "Send"}
            </button>
          ) : (
            <a className="btn solid" href="/api/gmail/connect">
              Connect Gmail to send
            </a>
          )}
          <button
            className="btn"
            onClick={() => copy(d.site + "-email", `Subject: ${subject}\n\n${body}`)}
          >
            {copied === d.site + "-email" ? "Copied" : "Copy"}
          </button>
          <a
            className="btn"
            target="_blank"
            rel="noreferrer"
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
          >
            Open in Gmail
          </a>
        </div>
        {msg && <p className={"msg" + (msg === "Sent." ? " ok" : "")}>{msg}</p>}
        {sentInfo && msg !== "Sent." && (
          <p className="note">
            You already emailed {sentInfo.to} on {new Date(sentInfo.at).toLocaleDateString()}.
          </p>
        )}
        <p className="note">
          An opt-out line is added to every email. Limit: 20 emails per day.
        </p>
      </div>
    </details>
  );
}

export default function Drafts({ d, copy, copied, gmail, onSent, sentInfo }) {
  const drafts = d.drafts || {};
  return (
    <div>
      {drafts.email && (
        <EmailBox
          d={d}
          gmail={gmail}
          copy={copy}
          copied={copied}
          onSent={onSent}
          sentInfo={sentInfo}
        />
      )}
      {Object.keys(LABELS).map((key) => {
        if (!drafts[key] || !d.socials || !d.socials[key]) return null;
        const id = d.site + "-" + key;
        return (
          <details className="draft" key={key}>
            <summary>{LABELS[key]} message</summary>
            <div className="draft-body">
              <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{drafts[key]}</p>
              <button className="btn" onClick={() => copy(id, drafts[key], d.socials[key])}>
                {copied === id ? "Copied" : `Copy and open ${LABELS[key]}`}
              </button>
            </div>
          </details>
        );
      })}
    </div>
  );
                                                         }
