"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "../Header";
import useGmail from "../useGmail";
import { LABELS } from "../ui";
import "../profile.css";

function channelName(k) {
  return k === "email" ? "Email" : LABELS[k] || k;
}

export default function Profile() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (!gmail.loaded || !gmail.connected) return;
    fetch("/api/track")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setData(j);
        else setError(j.error || "Could not load your campaigns.");
      })
      .catch(() => setError("Network problem. Please try again."));
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.bookingLink) setLink(j.bookingLink);
      })
      .catch(() => {});
  }, [gmail.loaded, gmail.connected]);

  async function saveLink() {
    setLinkMsg("");
    const value = link.trim();
    if (value && !/^https:\/\/\S+$/i.test(value)) {
      setLinkMsg("The link must start with https:// and have no spaces.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingLink: value }),
      });
      setLinkMsg(
        r.ok
          ? value
            ? "Saved. Every email you send now includes this link."
            : "Removed. Emails will no longer include a booking link."
          : "Could not save the link. Try again."
      );
    } catch {
      setLinkMsg("Network problem. Please try again.");
    }
    setSaving(false);
  }

  const t = data ? data.totals : null;
  const channels = t ? Object.keys(t.channels).sort((a, b) => t.channels[b] - t.channels[a]) : [];
  const top = channels.length ? t.channels[channels[0]] : 1;
  const rate = t && t.sent > 0 ? ` (${Math.round((t.replied / t.sent) * 100)}% of sent)` : "";

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">{name ? `${name}'s campaigns` : "Your campaigns"}</h1>
        <p className="lead">
          How your outreach is going: what you sent, who replied and which calls got booked.
        </p>
        {error && <p className="error">{error}</p>}

        {t && (
          <>
            <div className="stats">
              <div className="stat">
                <b>{t.campaigns}</b>
                <span>Campaigns</span>
              </div>
              <div className="stat">
                <b>{t.sent}</b>
                <span>Messages sent</span>
              </div>
              <div className="stat">
                <b>{t.replied}</b>
                <span>Replies{rate}</span>
              </div>
              <div className="stat">
                <b>{t.booked}</b>
                <span>Calls booked</span>
              </div>
            </div>

            {channels.length > 0 && (
              <div className="plat">
                <h3>Platforms used</h3>
                {channels.map((k) => (
                  <div className="prow" key={k}>
                    <span>{channelName(k)}</span>
                    <div className="pbar">
                      <i style={{ width: Math.max(6, (t.channels[k] / top) * 100) + "%" }} />
                    </div>
                    <span>{t.channels[k]}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="plat" style={{ marginTop: "24px" }}>
          <h3>Booking link</h3>
          <p className="note-s">
            Paste your Cal.com or Calendly link. Plyde adds a line to every email you send so
            interested people can book a call straight away. You don't have to do anything else.
          </p>
          <input
            className="in"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://cal.com/your-name/intro-call"
          />
          <div className="actions">
            <button className="btn solid" disabled={saving} onClick={saveLink}>
              {saving ? "Saving..." : "Save link"}
            </button>
          </div>
          {linkMsg && <p className="msg">{linkMsg}</p>}
        </div>

        <div className="ctas">
          <Link className="cta" href="/campaign">
            Run a campaign
          </Link>
        </div>
      </section>

      <section className="paper">
        <div className="wrap">
          <h2>Campaigns</h2>
          {!data && !error && <p className="sub">Loading...</p>}
          {data && data.campaigns.length === 0 && (
            <p className="sub">
              No campaigns saved yet. Run a campaign and it will appear here with its numbers.
            </p>
          )}
          {data &&
            data.campaigns.map((c) => (
              <Link className="crow" key={c.id} href={"/profile/campaign?id=" + c.id}>
                <h3>{c.title}</h3>
                <div className="meta">
                  {new Date(c.created_at).toLocaleDateString()}
                  {c.target ? " · Reaching: " + c.target : ""}
                </div>
                <div className="nums">
                  <span>
                    <b>{c.prospects}</b> companies
                  </span>
                  <span>
                    <b>{c.sent}</b> sent
                  </span>
                  <span>
                    <b>{c.replied}</b> replies
                  </span>
                  <span>
                    <b>{c.booked}</b> calls booked
                  </span>
                  {Object.keys(c.channels).length > 0 && (
                    <span>
                      via{" "}
                      {Object.keys(c.channels)
                        .map((k) => channelName(k))
                        .join(", ")}
                    </span>
                  )}
                </div>
              </Link>
            ))}
        </div>
      </section>
    </>
  );
              }
