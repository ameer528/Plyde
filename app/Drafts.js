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

function EmailBox({ d, gmail, copy, copied, onSent, sentInfo }) {
  const email = d.drafts.email;
  const [myName] = useState(savedName);
  const [init] = useState(() => loadDraft(d.site) || {});
  const [to, setTo] = useState(
    init.to !== undefined ? init.to : d.emails && d.emails[0] ? d.emails[0].email : ""
  );
  const [subject, setSubject] = useState(
    init.subject !== undefined ? init.subject : fillName(email.subject, myName)
  );
  const [body, setBody] = useState(
    init.body !== undefined ? init.body : fillName(email.body, myName)
  );
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("plyde_draft_" + d.site, JSON.stringify({ to, subject, body }));
    } catch {}
  }, [to, subject, body, d.site]);

  useEffect(() => {
    const addr = to.trim();
    if (!addr.includes("@")) {
      setCheck(null);
      return;
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      const r = await post("/api/verify", { email: addr });
      setCheck(r.ok ? { ...r.json, for: addr } : null);
      setChecking(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [to]);

  async function send() {
    setMsg("");
    const addr = to.trim();
    if (!addr) {
      setMsg("Add the recipient's email first.");
      return;
    }
    if (/\[[^\]]+\]/.test(subject + " " + body)) {
      setMsg("Replace the [placeholders] in the message before sending.");
      return;
    }
    setSending(true);
    let c = check && check.for === addr ? check : null;
    if (!c) {
      const r = await post("/api/verify", { email: addr });
      c = r.ok ? { ...r.json, for: addr } : null;
      setCheck(c);
    }
    if (!c) {
      setSending(false);
      setMsg("Could not verify this address right now. Try again.");
      return;
    }
    if (c.status === "invalid") {
      setSending(false);
      setMsg("Not sent. " + (c.reasons[0] || "This address failed verification."));
      return;
    }
    let allowRisky = false;
    if (c.status === "risky") {
      allowRisky = window.confirm(
        "This address is risky: " + (c.reasons[0] || "") + "\n\nSend anyway?"
      );
      if (!allowRisky) {
        setSending(false);
        return;
      }
    }
    const ok = window.confirm(`Send this email to ${addr} from ${gmail.email || "your Gmail"}?`);
    if (!ok) {
      setSending(false);
      return;
    }
    const r = await post("/api/gmail/send", {
      to: addr,
      subject,
      body,
      approved: true,
      allowRisky,
    });
    setSending(false);
    if (r.ok) {
      setMsg("Sent.");
      onSent(d.site, addr, subject);
    } else {
      setMsg(r.json.error || "Could not send.");
      if (r.json.reconnect) gmail.refresh();
    }
  }

  const blocked = check && check.for === to.trim() && check.status === "invalid";

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
        {checking && <p className="note-s">Checking this address...</p>}
        {!checking && check && check.for === to.trim() && (
          <p className="note-s">
            {check.status === "ok" && "Checked: the format is valid and the domain can receive email. "}
            {check.status === "risky" && "Risky: "}
            {check.status === "invalid" && "Cannot send: "}
            {check.reasons.join(" ")}{" "}
            {check.status !== "invalid" && check.note}
          </p>
        )}
        <label className="lbl">Subject</label>
        <input className="in" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="lbl">Message</label>
        <textarea className="ta" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="actions">
          {gmail.connected ? (
            <button className="btn solid" disabled={sending || blocked} onClick={send}>
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
          <p className="note-s">
            You already emailed {sentInfo.to} on {new Date(sentInfo.at).toLocaleDateString()}.
          </p>
        )}
        <p className="note-s">
          An opt-out line is added to every email. Limit: 20 emails per day.
        </p>
      </div>
    </details>
  );
}

export default function Drafts({ d, copy, copied, gmail, onSent, sentInfo }) {
  const drafts = d.drafts || {};
  const [myName] = useState(savedName);
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
        const text = fillName(drafts[key], myName);
        return (
          <details className="draft" key={key}>
            <summary>{LABELS[key]} message</summary>
            <div className="draft-body">
              <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{text}</p>
              <button className="btn" onClick={() => copy(id, text, d.socials[key])}>
                {copied === id ? "Copied" : `Copy and open ${LABELS[key]}`}
              </button>
            </div>
          </details>
        );
      })}
    </div>
  );
      }
