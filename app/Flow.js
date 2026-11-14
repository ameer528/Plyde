"use client";

import { useState, useRef, useEffect } from "react";
import { card, field, sleep, post } from "./ui";
import Company from "./Company";

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
            <Company
              key={d.site}
              d={d}
              copy={copy}
              copied={copied}
              gmail={{ ...gmail, refresh: refreshGmail }}
              onSent={onSent}
              sentInfo={sentLog.find((x) => x.site === d.site)}
            />
          ))}

          {ready && !busy && (
            <button
              onClick={fillBatch}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
                color: "#F8FAFC",
                fontWeight: 600,
                fontSize: "16px",
                marginBottom: "12px",
              }}
            >
              Find 5 more
            </button>
          )}

          <p style={{ textAlign: "center", color: "#64748B", fontSize: "13px" }}>
            {unreadable > 0 ? `${unreadable} site(s) could not be read. ` : ""}
            {dropped > 0 ? `${dropped} established company(ies) were left out. ` : ""}
            Stages, scores and drafts are AI-written from public websites. Review everything before you send.
          </p>
        </div>
      )}

      {sentLog.length > 0 && (
        <details style={{ marginTop: "20px" }}>
          <summary style={{ cursor: "pointer", color: "#CBD5E1", fontWeight: 600 }}>
            Sent emails ({sentLog.length})
          </summary>
          {sentLog.map((s) => (
            <p key={s.at} style={{ color: "#94A3B8", fontSize: "13px", margin: "8px 0" }}>
              {new Date(s.at).toLocaleString()}: {s.subject} to {s.to} ({s.site})
            </p>
          ))}
        </details>
      )}
    </div>
  );
    }
