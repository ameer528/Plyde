"use client";

import { useState } from "react";
import { field, ghost, solid, LABELS, post } from "./ui";

function EmailBox({ d, gmail, copy, copied, onSent, sentInfo }) {
  const email = d.drafts.email;
  const [to, setTo] = useState(d.emails && d.emails[0] ? d.emails[0].email : "");
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

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

  const input = {
    ...field,
    width: "100%",
    boxSizing: "border-box",
    padding: "10px",
    margin: "4px 0 10px",
  };

  return (
    <details open style={{ marginBottom: "8px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Email draft</summary>
      <div style={{ marginTop: "10px" }}>
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>To</label>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient email (none found publicly)"
          style={input}
        />
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={input}
        />
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          style={{ ...input, lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {gmail.connected ? (
            <button
              style={{ ...solid, opacity: sending ? 0.6 : 1 }}
              disabled={sending}
              onClick={send}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          ) : (
            <a href="/api/gmail/connect" style={solid}>
              Connect Gmail to send
            </a>
          )}
          <button
            style={ghost}
            onClick={() => copy(d.site + "-email", `Subject: ${subject}\n\n${body}`)}
          >
            {copied === d.site + "-email" ? "Copied" : "Copy"}
          </button>
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            target="_blank"
            rel="noreferrer"
            style={ghost}
          >
            Open in Gmail
          </a>
        </div>
        {msg && (
          <p style={{ margin: "10px 0 0", color: msg === "Sent." ? "#10B981" : "#F59E0B", fontSize: "14px" }}>
            {msg}
          </p>
        )}
        {sentInfo && msg !== "Sent." && (
          <p style={{ margin: "10px 0 0", color: "#94A3B8", fontSize: "13px" }}>
            You already emailed {sentInfo.to} on {new Date(sentInfo.at).toLocaleDateString()}.
          </p>
        )}
        <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: "12px" }}>
          An opt-out line is added to every email automatically. Limit: 20 emails per day.
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
          <details key={key} style={{ marginBottom: "8px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{LABELS[key]} message</summary>
            <p style={{ margin: "10px 0", color: "#CBD5E1", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {drafts[key]}
            </p>
            <button style={ghost} onClick={() => copy(id, drafts[key], d.socials[key])}>
              {copied === id ? "Copied" : `Copy and open ${LABELS[key]}`}
            </button>
          </details>
        );
      })}
    </div>
  );
}
