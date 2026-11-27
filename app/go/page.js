"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "../Header";
import useGmail from "../useGmail";
import { post, sleep } from "../ui";

const FIND = 10;
const GAP_MIN = 45;
const GAP_MAX = 120;
const KEY = "plyde_go";

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function Go() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [cards, setCards] = useState([]);
  const [sentLog, setSentLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [credits, setCredits] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [lines, setLines] = useState([]);
  const [ready, setReady] = useState(false);

  const ctxRef = useRef(null);
  const cardsRef = useRef([]);
  const profRef = useRef(null);
  const stopRef = useRef(false);
  const started = useRef(false);

  function persist(nextCards, ctx) {
    write(KEY, { cards: nextCards, ctx: ctx === undefined ? ctxRef.current : ctx });
  }

  function updateCards(fn) {
    const next = fn(cardsRef.current);
    cardsRef.current = next;
    setCards(next);
    persist(next);
  }

  function refreshCredits() {
    fetch("/api/credits?balanceOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.balance === "number") setCredits(j.balance);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (!gmail.loaded || !gmail.connected || started.current) return;
    started.current = true;
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
    setSentLog(read("plyde_sent_log", []));
    const saved = read(KEY, null);
    if (saved) {
      cardsRef.current = saved.cards || [];
      setCards(cardsRef.current);
      ctxRef.current = saved.ctx || null;
    }
    refreshCredits();
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        let website = (j && j.website) || "";
        let description = (j && j.description) || "";
        if (!website && !description) {
          const old = read("plyde_campaign", null);
          if (old) {
            website = old.website || "";
            description = old.description || "";
          }
        }
        if (j && j.name) setName(j.name);
        if (j && j.dailyLimit) setDailyLimit(Number(j.dailyLimit) || 20);
        if (!website && !description) {
          router.replace("/setup");
          return;
        }
        profRef.current = { website, description };
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [gmail.loaded, gmail.connected]);

  async function find() {
    if (busy || sending) return;
    const p = profRef.current;
    if (!p) {
      setError("Your business details are missing. Open your setup and try again.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    let c = ctxRef.current;

    if (!c) {
      setProgress("Reading your business...");
      const a = await post("/api/analyze", { website: p.website, description: p.description });
      if (!a.ok) {
        setBusy(false);
        setProgress("");
        setError((a.json && a.json.error) || "Something went wrong. Please try again.");
        return;
      }
      const prof = a.json.result;
      const ownHost =
        a.json.site === "this business" ? "" : String(a.json.site).replace(/^www\./, "");
      const summary = prof.business_summary || "";
      const target = prof.segments && prof.segments[0] ? prof.segments[0].name : "";

      let campaignId = null;
      const created = await post("/api/track", {
        action: "create_campaign",
        title: ownHost || (p.description || "My campaign").slice(0, 60),
        website: p.website,
        description: p.description,
        summary,
        target,
      });
      if (created.ok && created.json.id) campaignId = created.json.id;

      setProgress("Checking your market...");
      const seenInit = ownHost ? [ownHost] : [];
      let edge = "";
      const m = await post("/api/competitors", { profile: { summary }, host: ownHost });
      if (m.ok) {
        edge = (m.json.differentiators || []).join("; ");
        (m.json.competitors || []).forEach((x) => {
          try {
            seenInit.push(new URL(x.url).hostname.replace(/^www\./, ""));
          } catch {}
        });
      }

      setProgress("Finding who needs you...");
      const good = (r) =>
        r.ok && Array.isArray(r.json.opportunities) && r.json.opportunities.length > 0;
      let o = await post("/api/opportunities", { profile: { summary }, host: ownHost });
      if (!good(o)) o = await post("/api/opportunities", { profile: { summary }, host: ownHost });
      const opps = good(o)
        ? o.json.opportunities
        : (prof.segments || []).map((s) => ({ name: s.name, phrase: s.name }));

      c = { summary, target, edge, ownHost, campaignId, opps, oppIdx: 0, seen: seenInit };
      ctxRef.current = c;
      persist(cardsRef.current, c);
    }

    const seen = new Set(c.seen || []);
    const queue = [];
    let kept = 0;
    let searches = 0;
    let rotations = 0;
    let failedFirst = "";

    while (kept < FIND) {
      if (queue.length === 0) {
        if (searches >= 2) {
          if (c.opps.length < 2 || rotations >= 3) break;
          c.oppIdx = (c.oppIdx + 1) % c.opps.length;
          rotations++;
          searches = 0;
        }
        searches++;
        const o = c.opps[c.oppIdx] || null;
        const tgt = o
          ? (o.name + (o.phrase ? " (" + o.phrase + ")" : "")).slice(0, 280)
          : c.target;
        setProgress(o ? "Searching: " + o.name : "Searching the web...");
        const d = await post("/api/discover", { profile: { summary: c.summary, target: tgt } });
        if (!d.ok) {
          if (kept === 0 && searches === 1 && rotations === 0) {
            failedFirst = (d.json && d.json.error) || "Search failed.";
            break;
          }
          continue;
        }
        for (const s of d.json.sites || []) {
          const h = String(s.host).replace(/^www\./, "");
          if (seen.has(h)) continue;
          seen.add(h);
          queue.push({ ...s, target: tgt });
        }
        if (queue.length === 0) continue;
      }

      const site = queue.shift();
      setProgress(`Researching ${site.host} (${kept} of ${FIND} ready)`);
      const r = await post("/api/research", {
        website: site.url,
        profile: { summary: c.summary, target: site.target || c.target, edge: c.edge },
      });
      if (
        r.ok &&
        (!r.json.relationship || r.json.relationship === "prospect") &&
        r.json.stage !== "established"
      ) {
        const to = r.json.emails && r.json.emails[0] ? r.json.emails[0].email : "";
        const em = r.json.drafts && r.json.drafts.email;
        if (to && em) {
          kept++;
          let pid = null;
          if (c.campaignId) {
            const added = await post("/api/track", {
              action: "add_prospect",
              campaignId: c.campaignId,
              prospect: {
                site: r.json.site,
                url: r.json.url,
                fit_score: r.json.fit_score,
                stage: r.json.stage,
                company_summary: r.json.company_summary,
                emails: r.json.emails,
                socials: r.json.socials,
                data: r.json,
              },
            });
            if (added.ok && added.json.id) pid = added.json.id;
          }
          const first = r.json.people && r.json.people[0] ? r.json.people[0] : null;
          const card = {
            site: r.json.site,
            url: r.json.url,
            fit: r.json.fit_score || 0,
            summary: r.json.company_summary || "",
            reason: r.json.fit_reason || "",
            person: first ? { name: first.name, title: first.title } : null,
            to,
            subject: em.subject || "",
            body: em.body || "",
            pid,
          };
          updateCards((prev) => [...prev, card]);
        }
      }
      await sleep(2500);
    }

    for (const s of queue) seen.delete(String(s.host).replace(/^www\./, ""));
    c.seen = [...seen];
    ctxRef.current = c;
    persist(cardsRef.current, c);
    setBusy(false);
    setProgress("");
    if (failedFirst) setError(failedFirst);
    else if (kept === 0) {
      setNote("No new companies with a public email were found this time. Try again in a moment.");
    } else if (kept < FIND) {
      setNote(`Found ${kept} new companies this time.`);
    }
  }

  function fill(text) {
    return name ? String(text || "").replace(/\[Your name\]/gi, name) : String(text || "");
  }

  function statusOf(c) {
    const to = String(c.to || "").trim();
    const already = sentLog.some(
      (x) => x.site === c.site || (to && String(x.to || "").toLowerCase() === to.toLowerCase())
    );
    if (already) return "sent";
    if (!to.includes("@")) return "noemail";
    if (/\[[^\]]+\]/.test(fill(c.subject) + " " + fill(c.body))) return "edit";
    return "ready";
  }

  const STATUS_TEXT = {
    sent: "Already emailed",
    noemail: "No email address",
    edit: "Fill in the [brackets] first",
    ready: "Ready",
  };

  const todayKey = new Date().toDateString();
  const sentToday = sentLog.filter((x) => new Date(x.at).toDateString() === todayKey).length;
  const room = Math.max(0, dailyLimit - sentToday);
  const cap = credits === null ? room : Math.min(room, Math.max(0, credits));
  const sorted = [...cards].sort((a, b) => (b.fit || 0) - (a.fit || 0));
  const readyList = sorted.filter((c) => statusOf(c) === "ready");

  function patchCard(site, patch) {
    updateCards((prev) => prev.map((c) => (c.site === site ? { ...c, ...patch } : c)));
  }

  function logSent(card, to, subject) {
    const entry = { site: card.site, to, subject, at: Date.now() };
    setSentLog((prev) => {
      const next = [entry, ...prev].slice(0, 200);
      write("plyde_sent_log", next);
      return next;
    });
    const cid = ctxRef.current && ctxRef.current.campaignId;
    if (cid && card.pid) {
      post("/api/track", {
        action: "log_activity",
        campaignId: cid,
        prospectId: card.pid,
        kind: "sent",
        channel: "email",
      });
    }
  }

  async function sendAll() {
    if (sending || busy) return;
    const add = (l) => setLines((p) => [...p, l]);
    if (credits !== null && credits <= 0) {
      setLines(["You are out of credits. Open Credits to top up."]);
      return;
    }
    if (room === 0) {
      setLines([`You reached today's limit of ${dailyLimit}. Come back tomorrow, or upgrade to Premium for a higher limit.`]);
      return;
    }
    const list = readyList.slice(0, cap);
    if (!list.length) return;
    const left = readyList.length - list.length;
    const ok = window.confirm(
      `Send ${list.length} email${list.length > 1 ? "s" : ""} from ${gmail.email || "your Gmail"}? This uses ${list.length} credit${list.length > 1 ? "s" : ""}.\n\nThey go out one at a time, about 1 to 2 minutes apart. Keep this page open and your screen on until it finishes.` +
        (left > 0 ? `\n\n${left} more will wait.` : "")
    );
    if (!ok) return;

    stopRef.current = false;
    setSending(true);
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
      const c = list[i];
      const subject = fill(c.subject);
      const res = await post("/api/gmail/send", {
        to: String(c.to).trim(),
        subject,
        body: fill(c.body),
        approved: true,
      });
      if (res.ok) {
        sent++;
        logSent(c, String(c.to).trim(), subject);
        add(`Sent to ${c.to}`);
        if (res.json && typeof res.json.creditsLeft === "number") setCredits(res.json.creditsLeft);
      } else {
        const err = (res.json && res.json.error) || "Could not send.";
        add(`Skipped ${c.to}: ${err}`);
        if (res.json && res.json.credits) {
          add("Stopped. You are out of credits.");
          setCredits(0);
          break;
        }
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
    setSending(false);
    refreshCredits();
  }

  const rowStyle = { borderTop: "1px solid rgba(128,128,128,0.35)", padding: "14px 0" };

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">{cards.length ? "Your clients are ready." : "Find your next clients."}</h1>
        <p className="lead">
          {cards.length
            ? "Check the list below, then approve and send."
            : "Plyde finds companies that need your service and writes each email. It takes a few minutes."}
        </p>

        {error && (
          <p className="error">
            {error} <Link href="/setup">Check your setup</Link>
          </p>
        )}
        {note && <p className="note">{note}</p>}

        {busy ? (
          <div>
            <p>{progress}</p>
            <div className="track">
              <div className="fill" />
            </div>
            <p className="note-s">Keep this page open while Plyde works.</p>
          </div>
        ) : (
          <div className="ctas">
            <a
              className="cta"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (ready) find();
              }}
            >
              {cards.length ? `Find ${FIND} more` : "Find clients"}
            </a>
          </div>
        )}
      </section>

      {cards.length > 0 && (
        <section className="paper">
          <div className="wrap">
            <div className="plat">
              <h3>{readyList.length} ready to send</h3>
              <p className="note-s">
                Credits: <b>{credits === null ? "..." : credits}</b> (1 per email) · Today:{" "}
                <b>
                  {sentToday} of {dailyLimit}
                </b>{" "}
                sent. <Link href="/credits">History</Link> ·{" "}
                <Link href="/credits">Upgrade to Premium</Link>
              </p>
              <div className="actions">
                <button
                  className="btn solid"
                  disabled={sending || busy || cap === 0 || readyList.length === 0}
                  onClick={sendAll}
                >
                  {sending
                    ? "Sending..."
                    : `Approve and send all (${Math.min(cap, readyList.length)})`}
                </button>
                {sending && (
                  <button className="btn" onClick={() => (stopRef.current = true)}>
                    Stop
                  </button>
                )}
              </div>
              {credits !== null && credits <= 0 && (
                <p className="msg">You are out of credits. Open Credits to top up.</p>
              )}
              {room === 0 && (
                <p className="msg">You reached today's limit of {dailyLimit}. Try again tomorrow.</p>
              )}
              {sending && countdown > 0 && (
                <p className="note-s">Next email in {countdown}s. Keep this page open.</p>
              )}
              {lines.map((l, i) => (
                <p key={i} className="note-s" style={{ margin: "4px 0" }}>
                  {l}
                </p>
              ))}
              <p className="note-s">
                Risky or invalid addresses are skipped automatically. An opt-out line is added to
                every email.
              </p>
            </div>

            <h2 style={{ marginTop: "32px" }}>Companies</h2>
            {sorted.map((c) => (
              <div key={c.site} style={rowStyle}>
                <p style={{ margin: "0 0 4px" }}>
                  <b>{c.site}</b> · {c.fit}% fit
                </p>
                <p className="note-s" style={{ margin: "0 0 4px" }}>
                  {c.person
                    ? `${c.person.name}, ${c.person.title}`
                    : "No named decision-maker found, so the email goes to the company"}
                </p>
                <p className="note-s" style={{ margin: "0 0 4px" }}>
                  {c.reason || c.summary}
                </p>
                <p className="note-s" style={{ margin: "0 0 6px" }}>
                  {c.to} · {STATUS_TEXT[statusOf(c)]}
                </p>
                <details>
                  <summary className="note-s">Read and edit the email</summary>
                  <label className="lbl">To</label>
                  <input
                    className="in"
                    value={c.to}
                    onChange={(e) => patchCard(c.site, { to: e.target.value })}
                  />
                  <label className="lbl">Subject</label>
                  <input
                    className="in"
                    value={c.subject}
                    onChange={(e) => patchCard(c.site, { subject: e.target.value })}
                  />
                  <label className="lbl">Message</label>
                  <textarea
                    className="ta"
                    rows={8}
                    value={c.body}
                    onChange={(e) => patchCard(c.site, { body: e.target.value })}
                  />
                </details>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
                 }
