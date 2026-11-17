"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "./Header";
import Company from "./Company";
import Panel from "./Panel";
import Opportunities from "./Opportunities";
import useGmail from "./useGmail";
import { sleep, post } from "./ui";

const STAGES = [
  { key: "read", label: "Researching your business" },
  { key: "market", label: "Analyzing your competitors" },
  { key: "map", label: "Mapping every industry that needs your service" },
  { key: "search", label: "Finding companies that need you" },
  { key: "research", label: "Researching each company and writing outreach" },
];

const STATUS_TEXT = {
  wait: "Waiting",
  active: "In progress",
  done: "Done",
  stopped: "Stopped",
};

export default function CampaignRun() {
  const router = useRouter();
  const { gmail, refresh, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [stages, setStages] = useState({});
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [mapNote, setMapNote] = useState("");
  const [profile, setProfile] = useState(null);
  const [market, setMarket] = useState(null);
  const [opps, setOpps] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cards, setCards] = useState([]);
  const [unreadable, setUnreadable] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [offTarget, setOffTarget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState("");
  const [sentLog, setSentLog] = useState([]);

  const ctx = useRef(null);
  const queue = useRef([]);
  const seen = useRef(new Set());
  const started = useRef(false);
  const campaignRef = useRef(null);
  const pidsRef = useRef({});
  const oppsRef = useRef([]);
  const oppIdx = useRef(0);

  function setStage(key, value) {
    setStages((s) => ({ ...s, [key]: value }));
  }

  function targetFor(idx) {
    const o = oppsRef.current[idx];
    if (!o) return ctx.current ? ctx.current.target : "";
    return (o.name + (o.phrase ? " (" + o.phrase + ")" : "")).slice(0, 280);
  }

  function industryFor(idx) {
    const o = oppsRef.current[idx];
    return o ? o.name : "";
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      setName(localStorage.getItem("plyde_name") || "");
      setSentLog(JSON.parse(localStorage.getItem("plyde_sent_log") || "[]"));
    } catch {}

    let session = null;
    try {
      session = JSON.parse(localStorage.getItem("plyde_session") || "null");
    } catch {}
    if (session && session.profile) {
      setProfile(session.profile);
      setMarket(session.market || null);
      setCards(session.cards || []);
      setUnreadable(session.unreadable || 0);
      setDropped(session.dropped || 0);
      setOffTarget(session.offTarget || 0);
      setMapNote(session.mapNote || "");
      campaignRef.current = session.campaignId || null;
      pidsRef.current = session.pids || {};
      oppsRef.current = session.opps || [];
      oppIdx.current = session.oppIdx || 0;
      setOpps(oppsRef.current);
      setActiveIdx(oppIdx.current);
      const st = session.stages || {};
      const fixed = {};
      Object.keys(st).forEach((k) => {
        fixed[k] = st[k] === "active" ? "stopped" : st[k];
      });
      setStages(fixed);
      if (session.ctx) {
        ctx.current = session.ctx;
        setReady(true);
      }
      queue.current = session.queue || [];
      seen.current = new Set(session.seen || []);
      setRestored(true);
      return;
    }

    let campaign = null;
    try {
      campaign = JSON.parse(localStorage.getItem("plyde_campaign") || "null");
    } catch {}
    if (!campaign) {
      router.replace("/campaign");
      return;
    }
    setRestored(true);
    runCampaign(campaign);
  }, []);

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

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
          stages,
          mapNote,
          opps: oppsRef.current,
          oppIdx: oppIdx.current,
          campaignId: campaignRef.current,
          pids: pidsRef.current,
          ctx: ctx.current,
          queue: queue.current,
          seen: [...seen.current],
        })
      );
    } catch {}
  }, [restored, profile, market, cards, unreadable, dropped, offTarget, stages, opps, activeIdx, mapNote, ready]);

  function onSent(site, to, subject) {
    const entry = { site, to, subject, at: Date.now() };
    setSentLog((prev) => {
      const next = [entry, ...prev].slice(0, 200);
      try {
        localStorage.setItem("plyde_sent_log", JSON.stringify(next));
      } catch {}
      return next;
    });
    const cid = campaignRef.current;
    const pid = pidsRef.current[site];
    if (cid && pid) {
      post("/api/track", {
        action: "log_activity",
        campaignId: cid,
        prospectId: pid,
        kind: "sent",
        channel: "email",
      });
    }
  }

  async function copy(key, text, openUrl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
    if (openUrl) window.open(openUrl, "_blank", "noopener");
  }

  async function mapIndustries(summary, ownHost, prof) {
    setStage("map", "active");
    setDetail(
      "Thinking about every industry that could use your service, including ones you may not expect. This takes about a minute."
    );
    let o = await post("/api/opportunities", { profile: { summary }, host: ownHost });
    const good = (r) => r.ok && Array.isArray(r.json.opportunities) && r.json.opportunities.length > 0;
    if (!good(o)) {
      setDetail("Trying the industry research once more...");
      o = await post("/api/opportunities", { profile: { summary }, host: ownHost });
    }
    let list = good(o) ? o.json.opportunities : [];
    if (list.length === 0) {
      const why = o.json && o.json.error ? ": " + o.json.error : "";
      setMapNote("Industry mapping did not finish" + why + " Showing your basic customer types instead.");
      list = ((prof && prof.segments) || []).map((s) => ({
        name: s.name,
        buyer: "",
        pain: s.reason || "",
        use: "",
        trigger: "",
        obviousness: "obvious",
        fit_score: Number(s.fit_score) || 0,
        phrase: s.name,
      }));
    } else {
      setMapNote("");
    }
    oppsRef.current = list;
    oppIdx.current = 0;
    setOpps(list);
    setActiveIdx(0);
    setStage("map", "done");
  }

  async function retryMap() {
    if (!ctx.current || !profile) return;
    setBusy(true);
    await mapIndustries(ctx.current.summary, ctx.current.ownHost, profile);
    setDetail("");
    setBusy(false);
  }

  async function runCampaign(c) {
    setBusy(true);
    setError("");
    setStage("read", "active");
    setDetail("Reading your website or description...");
    const a = await post("/api/analyze", { website: c.website, description: c.description });
    if (!a.ok) {
      setStage("read", "stopped");
      setBusy(false);
      setError(a.json.error || "Something went wrong.");
      return;
    }
    const prof = a.json.result;
    const ownHost = a.json.site === "this business" ? "" : a.json.site.replace(/^www\./, "");
    setProfile(prof);
    setStage("read", "done");

    const summary = prof.business_summary || "";
    const target = prof.segments && prof.segments[0] ? prof.segments[0].name : "";

    const created = await post("/api/track", {
      action: "create_campaign",
      title: ownHost || (c.description || "My campaign").slice(0, 60),
      website: c.website,
      description: c.description,
      summary,
      target,
    });
    if (created.ok && created.json.id) campaignRef.current = created.json.id;

    setStage("market", "active");
    setDetail("Searching for competitors and what could set you apart...");
    const m = await post("/api/competitors", { profile: { summary }, host: ownHost });
    let edge = "";
    if (m.ok) {
      setMarket(m.json);
      edge = (m.json.differentiators || []).join("; ");
      (m.json.competitors || []).forEach((x) => {
        try {
          seen.current.add(new URL(x.url).hostname.replace(/^www\./, ""));
        } catch {}
      });
    }
    setStage("market", "done");

    await mapIndustries(summary, ownHost, prof);

    ctx.current = { summary, target, edge, ownHost };
    setReady(true);
    await fillBatch();
  }

  async function fillBatch(pick) {
    const c = ctx.current;
    if (typeof pick === "number") {
      oppIdx.current = pick;
      setActiveIdx(pick);
      queue.current = [];
    }
    setError("");
    setNote("");
    setBusy(true);
    let kept = 0;
    let searches = 0;
    let rotations = 0;
    setStage("search", "active");

    while (kept < 5) {
      if (queue.current.length === 0) {
        if (searches >= 2) {
          if (oppsRef.current.length < 2 || rotations >= 3) break;
          oppIdx.current = (oppIdx.current + 1) % oppsRef.current.length;
          setActiveIdx(oppIdx.current);
          rotations++;
          searches = 0;
        }
        searches++;
        const tgt = targetFor(oppIdx.current);
        const ind = industryFor(oppIdx.current);
        setStage("search", "active");
        setDetail(ind ? `Searching: ${ind}` : "Searching the web for companies like your ideal customers...");
        const d = await post("/api/discover", {
          profile: { summary: c.summary, target: tgt },
        });
        if (!d.ok) {
          if (kept === 0 && searches === 1 && rotations === 0) {
            setStage("search", "stopped");
            setBusy(false);
            setError(d.json.error || "Search failed.");
            return;
          }
          continue;
        }
        for (const s of d.json.sites || []) {
          const h = s.host.replace(/^www\./, "");
          if (h === c.ownHost || seen.current.has(h)) continue;
          seen.current.add(h);
          queue.current.push({ ...s, target: tgt, industry: ind });
        }
        setStage("search", "done");
        if (queue.current.length === 0) continue;
      }

      setStage("research", "active");
      const site = queue.current.shift();
      setDetail(`Researching ${site.host} (${kept} of 5 found)`);
      const r = await post("/api/research", {
        website: site.url,
        profile: { summary: c.summary, target: site.target || c.target, edge: c.edge },
      });
      if (r.ok) {
        if (r.json.relationship && r.json.relationship !== "prospect") {
          setOffTarget((n) => n + 1);
        } else if (r.json.stage === "established") {
          setDropped((n) => n + 1);
        } else {
          kept++;
          const card = { ...r.json, industry: site.industry || "" };
          if (campaignRef.current) {
            const added = await post("/api/track", {
              action: "add_prospect",
              campaignId: campaignRef.current,
              prospect: {
                site: card.site,
                url: card.url,
                fit_score: card.fit_score,
                stage: card.stage,
                company_summary: card.company_summary,
                emails: card.emails,
                socials: card.socials,
                data: card,
              },
            });
            if (added.ok && added.json.id) pidsRef.current[card.site] = added.json.id;
          }
          setCards((prev) => [...prev, card]);
        }
      } else {
        setUnreadable((n) => n + 1);
      }
      await sleep(2500);
    }

    setStage("search", "done");
    setStage("research", "done");
    setDetail("");
    setBusy(false);
    if (kept === 0) {
      setNote("No new early-stage buyers could be found this time. Try another industry below.");
    } else if (kept < 5) {
      setNote(`Found ${kept} new companies this time. Try again for more.`);
    }
  }

  const allDone = stages.research === "done" && !busy;

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">{allDone ? "Your campaign is ready." : "Running your campaign."}</h1>
        <p className="lead">
          {allDone
            ? "Review each company below, edit the drafts and send the ones you approve."
            : "Plyde is working through five steps. You can keep this page open while it runs."}
        </p>

        <ol className="stages">
          {STAGES.map((s) => {
            const st = stages[s.key] || "wait";
            return (
              <li
                key={s.key}
                className={"stage " + (st === "active" ? "on" : st === "done" ? "done" : "")}
              >
                <b>{s.label}</b>
                <span className="st">{STATUS_TEXT[st] || "Waiting"}</span>
                {st === "active" && (
                  <>
                    <span className="detail">{detail}</span>
                    <div className="track">
                      <div className="fill" />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="error">
            {error} <Link href="/campaign">Start over</Link>
          </p>
        )}
        {note && <p className="note">{note}</p>}
      </section>

      {profile && (
        <section className="paper">
          <div className="wrap">
            <Panel profile={profile} market={market} />

            {cards.length > 0 && (
              <>
                <h2>Companies that may need you</h2>
                <p className="sub">
                  Early-stage companies, ranked by how well they fit. Scores and drafts are written
                  by AI from public websites, so check them before you send.
                </p>
                {[...cards]
                  .sort((a, b) => b.fit_score - a.fit_score)
                  .map((d) => (
                    <Company
                      key={d.site}
                      d={d}
                      copy={copy}
                      copied={copied}
                      gmail={{ ...gmail, refresh }}
                      onSent={onSent}
                      sentInfo={sentLog.find((x) => x.site === d.site)}
                    />
                  ))}
                {ready && !busy && (
                  <button className="more" onClick={() => fillBatch()}>
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

            <div style={{ marginTop: "48px" }}>
              <Opportunities
                opps={opps}
                activeIndex={activeIdx}
                busy={busy}
                onPick={(i) => fillBatch(i)}
                note={mapNote}
                onRetry={retryMap}
              />
            </div>

            {allDone && (
              <p style={{ marginTop: "28px" }}>
                <Link className="btn solid" href="/campaign">
                  Run another campaign
                </Link>
              </p>
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
