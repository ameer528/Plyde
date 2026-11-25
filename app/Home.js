"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "./Header";
import Rewrite from "./Rewrite";
import TryIt from "./TryIt";
import Story from "./Story";
import FollowUps from "./FollowUps";
import ReplyHelper from "./ReplyHelper";
import useGmail from "./useGmail";
import useName from "./useName";

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function per(used, count) {
  if (!count) return null;
  const v = used / count;
  return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + " credits";
}

export default function Home() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const { name, loaded } = useName(gmail.connected);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState(null);
  const [credits, setCredits] = useState(null);
  const [unsent, setUnsent] = useState(0);
  const [sentLog, setSentLog] = useState([]);

  const signedIn = gmail.loaded && gmail.connected && loaded && !!name;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("gmail");
    if (q) {
      const texts = {
        denied: "Gmail was not connected. You can try again any time.",
        failed: "Something went wrong connecting Gmail. Please try again.",
      };
      setNotice(texts[q] || "");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (loaded && gmail.loaded && gmail.connected && !name) router.replace("/setup");
  }, [loaded, gmail, name, router]);

  useEffect(() => {
    if (!signedIn) return;
    const log = readJson("plyde_sent_log", []);
    setSentLog(log);
    const go = readJson("plyde_go", null);
    const list = (go && go.cards) || [];
    setUnsent(list.filter((c) => c.to && !log.some((x) => x.site === c.site)).length);
    fetch("/api/track")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.totals) setStats(j.totals);
      })
      .catch(() => {});
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setCredits({ balance: j.balance, used: j.used });
      })
      .catch(() => {});
  }, [signedIn]);

  const perReply = stats && credits ? per(credits.used, stats.replied) : null;
  const perBooked = stats && credits ? per(credits.used, stats.booked) : null;

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero">
        {signedIn ? (
          <h1 className="h1s">Hi, {name}.</h1>
        ) : (
          <h1>
            Find the <Rewrite /> that need you before anyone else does.
          </h1>
        )}
        <p className="lead">
          {signedIn
            ? "Here is where things stand."
            : "Plyde researches your market, finds companies that are still early, and drafts the outreach. You approve every message."}
        </p>

        {notice && <p className="banner">{notice}</p>}

        {gmail.loaded && !gmail.connected && (
          <>
            <div className="ctas">
              <a className="cta" href="/api/gmail/connect">
                Connect Gmail to begin
              </a>
            </div>
            <p className="note">
              Plyde asks Google only for permission to send emails you approve. It cannot read your
              inbox.
            </p>
            <TryIt />
          </>
        )}

        {signedIn && (
          <>
            <div className="ctas">
              <Link className="cta" href="/go">
                {unsent > 0
                  ? `Send your ${unsent} ready email${unsent > 1 ? "s" : ""}`
                  : "Find new clients"}
              </Link>
            </div>

            {stats && (
              <div className="stats" style={{ marginTop: "24px" }}>
                <div className="stat">
                  <b>{stats.sent}</b>
                  <span>Sent</span>
                </div>
                <div className="stat">
                  <b>{stats.replied}</b>
                  <span>Replies</span>
                </div>
                <div className="stat">
                  <b>{stats.booked}</b>
                  <span>Calls booked</span>
                </div>
                <div className="stat">
                  <b>{credits ? credits.balance : "..."}</b>
                  <span>Credits left</span>
                </div>
              </div>
            )}

            {stats && credits && (
              <p className="note-s" style={{ marginTop: "10px" }}>
                Credits used: {credits.used} ·{" "}
                {perReply ? `${perReply} per reply` : "no replies yet"} ·{" "}
                {perBooked ? `${perBooked} per booked call` : "no booked calls yet"}
              </p>
            )}

            <FollowUps />

            {sentLog.length > 0 && (
              <details style={{ marginTop: "24px" }}>
                <summary>Someone replied? Write your answer</summary>
                <ReplyHelper sentLog={sentLog} />
              </details>
            )}

            <p className="note" style={{ marginTop: "24px" }}>
              <Link href="/profile">Settings and campaigns</Link> ·{" "}
              <Link href="/credits">Credits</Link> · <Link href="/setup">Edit your setup</Link>
            </p>
          </>
        )}

        {!gmail.connected && (
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

        {!gmail.connected && gmail.loaded && <Story />}
      </section>
    </>
  );
      }
