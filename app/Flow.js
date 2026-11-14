"use client";

import { useState, useRef, useEffect } from "react";

const card = {
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "18px",
  marginBottom: "14px",
  textAlign: "left",
};

const field = {
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  fontFamily: "inherit",
};

const ghost = {
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "transparent",
  color: "#F8FAFC",
  fontSize: "14px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

const solid = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
  color: "#F8FAFC",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

const LABELS = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};

const STAGES = {
  early: "Early stage",
  growing: "Growing",
};

function scoreColor(score) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "Network problem. Please try again." } };
  }
}

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

  return (
    <details open style={{ marginBottom: "8px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Email draft</summary>
      <div style={{ marginTop: "10px" }}>
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>To</label>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient email (no public email was found)"
          style={{ ...field, width: "100%", boxSizing: "border-box", padding: "10px", margin: "4px 0 10px" }}
        />
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ ...field, width: "100%", boxSizing: "border-box", padding: "10px", margin: "4px 0 10px" }}
        />
        <label style={{ color: "#94A3B8", fontSize: "13px" }}>Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          style={{ ...field, width: "100%", boxSizing: "border-box", padding: "10px", margin: "4px 0 10px", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {gmail.connected ? (
            <button style={{ ...solid, opacity: sending ? 0.6 : 1 }} disabled={sending} onClick={send}>
              {sending ? "Sending..." : "Send"}
            </button>
          ) : (
            <a href="/api/gmail/connect" style={solid}>
              Connect Gmail to send
            </a>
          )}
          <button style={ghost} onClick={() => copy(d.site + "-email", `Subject: ${subject}\n\n${body}`)}>
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

function Drafts({ d, copy, copied, gmail, onSent, sentInfo }) {
  const drafts = d.drafts || {};
  return (
    <div>
      {drafts.email && (
        <EmailBox d={d} gmail={gmail} copy={copy} copied={copied} onSent={onSent} sentInfo={sentInfo} />
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

export default function Flow() {
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [market, setMarket] = useState(null);
  const [cards, setCards] = useState([]);
  const [unreadable, setUnreadable] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [copied, setCopied] = useState("");
  const [ready, setReady] = useState(false);
  const [gmail, setGmail] = useState({ connected: false, email: "", loaded: false });
  const [banner, setBanner] = useState("");
  const [sentLog, setSentLog] = useState([]);

  const ctx = useRef(null);
  const queue = useRef([]);
  const seen = useRef(new Set());

  const canRun = website.trim() || description.trim();

  async function refreshGmail() {
    try {
      const res = await fetch("/api/gmail/status");
      const j = await res.json();
      setGmail({ connected: !!j.connected, email: j.email || "", loaded: true });
    } catch {
      setGmail((g) => ({ ...g, loaded: true }));
    }
  }

  useEffect(() => {
    refreshGmail();
    try {
      setSentLog(JSON.parse(localStorage.getItem("plyde_sent_log") || "[]"));
    } catch {}
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (q) {
      const texts = {
        connected: "Gmail connected. You can now send emails you approve, straight from Plyde.",
        denied: "Gmail was not connected. You can try again any time.",
        failed: "Something went wrong connecting Gmail. Please try again.",
      };
      setBanner(texts[q] || "");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function disconnectGmail() {
    try {
      await fetch("/api/gmail/status", { method: "DELETE" });
    } catch {}
    refreshGmail();
  }

  function onSent(site, to, subject) {
    const entry = { site, to, subject, at: Date.now() };
    setSentLog((prev) => {
      const next = [entry, ...prev].slice(0, 200);
      try {
        localStorage.setItem("plyde_sent_log", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function copy(key, text, openUrl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
    if (openUrl) window.open(openUrl, "_blank", "noopener");
  }

  function stop(message) {
    setError(message);
    setStep("");
    setBusy(false);
  }

  async function fillBatch() {
    const c = ctx.current;
    setError("");
    setBusy(true);
    let kept = 0;
    let searches = 0;

    while (kept < 5) {
      if (queue.current.length === 0) {
        if (searches >= 3) break;
        searches++;
        setStep("Searching for more companies...");
        const d = await post("/api/discover", {
          profile: { summary: c.summary, target: c.target },
        });
        if (!d.ok) {
          if (kept === 0 && searches === 1) return stop(d.json.error || "Search failed.");
          break;
        }
        for (const s of d.json.sites || []) {
          const h = s.host.replace(/^www\./, "");
          if (h === c.ownHost || seen.current.has(h)) continue;
          seen.current.add(h);
          queue.current.push(s);
        }
        if (queue.current.length === 0) continue;
      }

      const site = queue.current.shift();
      setStep(`Researching ${site.host}... (${kept} of 5 found)`);
      const r = await post("/api/research", {
        website: site.url,
        profile: { summary: c.summary, target: c.target, edge: c.edge },
      });
      if (r.ok) {
        if (r.json.stage === "established") {
          setDropped((n) => n + 1);
        } else {
          kept++;
          setCards((prev) => [...prev, r.json]);
        }
      } else {
        setUnreadable((n) => n + 1);
      }
      await sleep(2500);
    }

    setStep("");
    setBusy(false);
    if (kept === 0) {
      setError("No new early-stage companies could be researched this time. Try again in a moment.");
    } else if (kept < 5) {
      setError(`Found ${kept} new companies this time. Try again for more.`);
    }
  }

  async function run(e) {
    e.preventDefault();
    setError("");
    setProfile(null);
    setMarket(null);
    setCards([]);
    setUnreadable(0);
    setDropped(0);
    setReady(false);
    queue.current = [];
    seen.current = new Set();
    setBusy(true);

    setStep("Reading your website...");
    const a = await post("/api/analyze", { website, description });
    if (!a.ok) {
      if (a.json.needsDescription) setShowDesc(true);
      return stop(a.json.error || "Something went wrong.");
    }
    const prof = a.json.result;
    const ownHost = a.json.site === "this business" ? "" : a.json.site.replace(/^www\./, "");
    setProfile(prof);
    const summary = prof.business_summary || "";
    const target = prof.segments && prof.segments[0] ? prof.segments[0].name : "";

    setStep("Checking your competitors...");
    const m = await post("/api/competitors", { profile: { summary }, host: ownHost });
    let edge = "";
    if (m.ok) {
      setMarket(m.json);
      edge = (m.json.differentiators || []).join("; ");
    }

    ctx.current = { summary, target, edge, ownHost };
    setReady(true);
    await fillBatch();
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "left" }}>
      {banner && (
        <p
          style={{
            background: "#1E293B",
            border: "1px solid #334155",
            borderRadius: "12px",
            padding: "12px",
            color: "#CBD5E1",
            fontSize: "14px",
            textAlign: "center",
          }}
        >
          {banner}
        </p>
      )}

      <form onSubmit={run}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Your website, e.g. yourbusiness.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ ...field, flex: 1, minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={busy || !canRun}
            style={{
              padding: "14px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
              color: "#F8FAFC",
              fontWeight: 600,
              fontSize: "16px",
              opacity: busy || !canRun ? 0.6 : 1,
            }}
          >
            {busy ? "..." : "Start"}
          </button>
        </div>
        {!showDesc && (
          <p
            onClick={() => setShowDesc(true)}
            style={{ color: "#94A3B8", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }}
          >
            No website? Describe what you sell instead
          </p>
        )}
        {showDesc && (
          <textarea
            placeholder="Describe what you sell and who you help."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{ ...field, width: "100%", boxSizing: "border-box", marginTop: "12px" }}
          />
        )}
      </form>

      {gmail.loaded && (
        <p style={{ color: "#94A3B8", fontSize: "13px", textAlign: "center", marginTop: "14px" }}>
          {gmail.connected ? (
            <>
              Gmail connected{gmail.email ? `: ${gmail.email}` : ""}.{" "}
              <span onClick={disconnectGmail} style={{ textDecoration: "underline", cursor: "pointer" }}>
                Disconnect
              </span>
            </>
          ) : (
            <a href="/api/gmail/connect" style={{ color: "#0EA5E9" }}>
              Connect Gmail to send emails from Plyde
            </a>
          )}
        </p>
      )}

      {step && <p style={{ color: "#94A3B8", textAlign: "center", marginTop: "20px" }}>{step}</p>}
      {error && <p style={{ color: "#F59E0B", textAlign: "center", marginTop: "20px" }}>{error}</p>}

      {profile && (
        <div style={{ marginTop: "28px" }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>What you sell</h3>
            <p style={{ margin: 0, color: "#CBD5E1", lineHeight: 1.5 }}>{profile.business_summary}</p>
          </div>

          {market && (
            <div style={card}>
              <h3 style={{ margin: "0 0 8px" }}>Your market</h3>
              {market.competitors && market.competitors.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#CBD5E1" }}>Competitors found</strong>
                  {market.competitors.map((c) => (
                    <div key={c.url || c.name} style={{ color: "#94A3B8", fontSize: "14px", marginTop: "4px" }}>
                      <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                        {c.name}
                      </a>
                      {c.note ? ` - ${c.note}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {market.differentiators && market.differentiators.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#CBD5E1" }}>How you could stand out</strong>
                  {market.differentiators.map((p) => (
                    <div key={p} style={{ color: "#94A3B8", fontSize: "14px", marginTop: "4px" }}>
                      - {p}
                    </div>
                  ))}
                </div>
              )}
              {market.positioning && (
                <p style={{ margin: 0, color: "#CBD5E1", fontSize: "14px", lineHeight: 1.5 }}>
                  {market.positioning}
                </p>
              )}
              <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: "12px" }}>
                AI inference from web search results. Check it before relying on it.
              </p>
            </div>
          )}
        </div>
      )}

      {cards.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <h3 style={{ textAlign: "center" }}>Early companies that may need you</h3>
          {cards.map((d) => (
            <div key={d.site} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                <strong style={{ wordBreak: "break-all" }}>{d.site}</strong>
                <span
                  style={{
                    background: scoreColor(d.fit_score),
                    color: "#0F172A",
                    fontWeight: 700,
                    borderRadius: "8px",
                    padding: "2px 10px",
                    height: "fit-content",
                  }}
                >
                  {d.fit_score}%
                </span>
              </div>
              <p style={{ margin: "6px 0 0", color: "#94A3B8", fontSize: "13px" }}>
                {STAGES[d.stage] || "Growing"} (AI guess: {d.stage_evidence})
              </p>
              <p style={{ color: "#CBD5E1", margin: "10px 0 6px", lineHeight: 1.5 }}>{d.company_summary}</p>
              <p style={{ color: "#94A3B8", margin: "0 0 6px", fontSize: "14px", lineHeight: 1.5 }}>
                <strong style={{ color: "#CBD5E1" }}>Why they might need you: </strong>
                {d.fit_reason}
              </p>
              <p style={{ color: "#94A3B8", margin: "0 0 12px", fontSize: "14px" }}>
                <strong style={{ color: "#CBD5E1" }}>Evidence: </strong>
                {d.evidence} (AI confidence: {d.confidence})
              </p>

              <div style={{ fontSize: "14px", marginBottom: "12px" }}>
                <strong style={{ color: "#CBD5E1" }}>Public contact: </strong>
                {d.emails && d.emails.length > 0 ? (
                  d.emails.map((m) => (
                    <div key={m.email} style={{ color: "#94A3B8" }}>
                      {m.email}{" "}
                      <a href={m.source} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                        (source)
                      </a>
                    </div>
                  ))
                ) : (
                  <span style={{ color: "#94A3B8" }}>
                    No public email found.{" "}
                    {d.contact_page && (
                      <a href={d.contact_page} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                        Their contact page
                      </a>
                    )}
                  </span>
                )}
                {d.socials && Object.keys(d.socials).length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {Object.keys(d.socials).map((k) => (
                      <a key={k} href={d.socials[k]} target="_blank" rel="noreferrer" style={ghost}>
                        {LABELS[k]}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <Drafts
                d={d}
             
