"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "../../Header";
import useGmail from "../../useGmail";
import { LABELS, STAGES, socialLabel, post } from "../../ui";
import "../../profile.css";

const STATUSES = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["booked", "Call booked"],
  ["won", "Won"],
  ["lost", "Lost"],
];

export default function CampaignDetail() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (!id || !gmail.loaded || !gmail.connected) return;
    fetch("/api/track?id=" + encodeURIComponent(id))
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setData(j);
        else setError(j.error || "Could not load this campaign.");
      })
      .catch(() => setError("Network problem. Please try again."));
  }, [id, gmail.loaded, gmail.connected]);

  async function update(pid, patch) {
    setData((d) => ({
      ...d,
      prospects: d.prospects.map((p) => (p.id === pid ? { ...p, ...patch } : p)),
      activity:
        patch.status === "replied" || patch.status === "booked"
          ? [
              { id: "local-" + Date.now(), prospect_id: pid, kind: patch.status, channel: "email" },
              ...d.activity,
            ]
          : d.activity,
    }));
    await post("/api/track", { action: "update_prospect", id: pid, ...patch });
  }

  const today = new Date().toISOString().slice(0, 10);
  const count = (kind) => (data ? data.activity.filter((a) => a.kind === kind).length : 0);

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <p>
          <Link className="back" href="/profile">
            Back to your campaigns
          </Link>
        </p>
        <h1 className="h1s">{data ? data.campaign.title : "Campaign"}</h1>
        {data && data.campaign.summary && <p className="lead">{data.campaign.summary}</p>}
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="stats">
            <div className="stat">
              <b>{data.prospects.length}</b>
              <span>Companies</span>
            </div>
            <div className="stat">
              <b>{count("sent")}</b>
              <span>Messages sent</span>
            </div>
            <div className="stat">
              <b>{count("replied")}</b>
              <span>Replies</span>
            </div>
            <div className="stat">
              <b>{count("booked")}</b>
              <span>Calls booked</span>
            </div>
          </div>
        )}
      </section>

      <section className="paper">
        <div className="wrap">
          <h2>Companies</h2>
          <p className="sub">
            Tap a status when something happens. Replies and booked calls are counted from what you
            mark here.
          </p>
          {!data && !error && <p className="sub">Loading...</p>}
          {data &&
            data.prospects.map((p) => {
              const socials = p.socials || {};
              const emails = Array.isArray(p.emails) ? p.emails : [];
              const due =
                p.follow_up && p.follow_up <= today && p.status !== "won" && p.status !== "lost";
              return (
                <article className="prospect" key={p.id}>
                  <div className="head">
                    <h3>{p.site}</h3>
                    <span className="tag">{STAGES[p.stage] || "Growing"}</span>
                    <span className="tag">{p.fit_score} fit</span>
                    {due && <span className="due">Follow up due</span>}
                  </div>
                  {p.company_summary && <p>{p.company_summary}</p>}
                  <div className="contact">
                    {emails.length > 0 && <div>Email: {emails.map((e) => e.email).join(", ")}</div>}
                    {Object.keys(socials).length > 0 && (
                      <div className="handles">
                        {Object.keys(socials).map((k) => (
                          <a key={k} className="handle" href={socials[k]} target="_blank" rel="noreferrer">
                            <b>{LABELS[k] || k}</b>
                            <span>{socialLabel(k, socials[k])}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="chips">
                    {STATUSES.map(([value, label]) => (
                      <button
                        key={value}
                        className={"chip" + (p.status === value ? " on" : "")}
                        onClick={() => p.status !== value && update(p.id, { status: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="pgrid">
                    <div>
                      <label className="lbl">Notes</label>
                      <textarea
                        className="ta"
                        rows={3}
                        defaultValue={p.notes || ""}
                        placeholder="What was said, what to do next"
                        onBlur={(e) => e.target.value !== (p.notes || "") && update(p.id, { notes: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="lbl">Follow up on</label>
                      <input
                        className="in"
                        type="date"
                        value={p.follow_up || ""}
                        onChange={(e) => update(p.id, { follow_up: e.target.value })}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
        </div>
      </section>
    </>
  );
    }
