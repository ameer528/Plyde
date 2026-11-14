"use client";

import { useState, useRef, useEffect } from "react";
import { sleep, post } from "./ui";
import Company from "./Company";
import Rewrite from "./Rewrite";
import markImg from "./mark-white.png";
import wordImg from "./word-white.png";

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
  const [offTarget, setOffTarget] = useState(0);
  const [copied, setCopied] = useState("");
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
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
    try {
      const s = JSON.parse(localStorage.getItem("plyde_session") || "null");
      if (s && s.profile) {
        setProfile(s.profile);
        setMarket(s.market || null);
        setCards(s.cards || []);
        setUnreadable(s.unreadable || 0);
        setDropped(s.dropped || 0);
        setOffTarget(s.offTarget || 0);
        setWebsite(s.website || "");
        setDescription(s.description || "");
        if (s.ctx) {
          ctx.current = s.ctx;
          setReady(true);
        }
        queue.current = s.queue || [];
        seen.current = new Set(s.seen || []);
      }
    } catch {}
    setRestored(true);
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

  useEffect(() => {
    if (!restored || !profile) return;
    try {
      localStorage.setItem(
        "plyde_session",
        JSON.stringify({
          profile,
          market,
          cards,
          unreadable,
          dropped,
          offTarget,
          website,
          description,
          ctx: ctx.current,
          queue: queue.current,
          seen: [...seen.current],
        })
      );
    } catch {}
  }, [restored, profile, market, cards, unreadable, dropped, offTarget, ready]);

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
        if (r.json.relationship && r.json.relationship !== "prospect") {
          setOffTarget((n) => n + 1);
        } else if (r.json.stage === "established") {
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
      setError("No new early-stage buyers could be found this time. Try again in a moment.");
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
    setOffTarget(0);
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
      (m.json.competitors || []).forEach((c) => {
        try {
          seen.current.add(new URL(c.url).hostname.replace(/^www\./, ""));
        } catch {}
      });
    }

    ctx.current = { summary, target, edge, ownHost };
    setReady(true);
    await fillBatch();
  }

  return (
    <>
      <header className="bar">
        <div className="brand">
          <img className="mark" src={markImg.src} alt="" />
          <img className="word" src={wordImg.src} alt="Plyde" />
        </div>
        {gmail.loaded && (
          <div className="status">
            {gmail.connected ? (
              <>
                Gmail connected{gmail.email ? ": " + gmail.email : ""}{" "}
                <button className="textbtn" onClick={disconnectGmail}>
                  Disconnect
                </button>
              </>
            ) : (
              <a href="/api/gmail/connect">Connect Gmail</a>
            )}
          </div>
        )}
      </header>

      <section className="hero">
        <h1>
          Find the <Rewrite /> that need you before anyone else does.
        </h1>
        <p className="lead">
          Enter your website. Plyde researches your market, finds companies that are still early,
          and drafts the outreach. You approve every message.
        </p>

        <form className="ask" onSubmit={run}>
          <input
            type="text"
            placeholder="yourwebsite.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-label="Your website"
          />
          <button type="submit" disabled={busy || !canRun}>
            {busy ? "Working" : "Start"}
          </button>
        </form>

        {!showDesc ? (
          <button className="link" onClick={() => setShowDesc(true)}>
            No website? Describe what you sell instead
          </button>
        ) : (
          <textarea
            className="desc"
            rows={4}
            placeholder="Describe what you sell and who you help."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}

        {banner && <p className="banner">{banner}</p>}
        {step && (
          <div className="progress">
            <p>{step}</p>
            <div className="track">
              <div className="fill" />
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}

        {!profile && !busy && (
          <ol className="steps">
            <li>
              <p>Plyde reads your website and works out what you sell.</p>
            </li>
            <li>
              <p>It checks your competitors and what could set you apart.</p>
            </li>
            <li>
              <p>
                It finds early-stage companies that fit, with the emails and social accounts they
                publish.
              </p>
            </li>
            <li>
              <p>It writes outreach for each channel. You edit, approve and send.</p>
            </li>
          </ol>
        )}
      </section>

      {profile && (
        <section className="paper">
          <div className="wrap">
            <div className="panel">
              <div className="cols">
                <div>
                  <h3>What you sell</h3>
                  <p>{profile.business_summary}</p>
                </div>
                {market && (
                  <div>
                    <h3>Your market</h3>
                    {market.competitors && market.competitors.length > 0 && (
                      <ul>
                        {market.competitors.map((c) => (
                          <li key={c.url || c.name}>
                            <a href={c.url} target="_blank" rel="noreferrer">
                              {c.name}
                            </a>
                            {c.note ? `: ${c.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {market.differentiators && market.differentiators.length > 0 && (
                      <>
                        <p>How you could stand out:</p>
                        <ul>
                          {market.differentiators.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {market.positioning && <p>{market.positioning}</p>}
                    <p className="fine">Based on web search results. Check it before relying on it.</p>
                  </div>
                )}
              </div>
            </div>

            {cards.length > 0 && (
              <>
                <h2>Companies that may need you</h2>
                <p className="sub">
                  Early-stage companies, ranked by how well they fit. Scores and drafts are written
                  by AI from public websites, so check them before you send.
                </p>
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
                  <button className="more" onClick={fillBatch}>
                    Find 5 more
                  </button>
                )}
                <p className="fine">
                  {offTarget > 0 ? `${offTarget} competitor(s) or poor fits were left out. ` : ""}
                  {dropped > 0 ? `${dropped} established company(ies) were left out. ` : ""}
                  {unreadable > 0 ? `${unreadable} site(s) could not be read.` : ""}
                </p>
              </>
            )}

            {sentLog.length > 0 && (
              <details className="sent">
                <summary>Sent emails ({sentLog.length})</summary>
                {sentLog.map((s) => (
                  <p key={s.at}>
                    {new Date(s.at).toLocaleString()}: {s.subject} to {s.to} ({s.site})
                  </p>
                ))}
              </details>
            )}
          </div>
        </section>
      )}
    </>
  );
            }
