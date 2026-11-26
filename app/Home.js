"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "./Header";
import Rewrite from "./Rewrite";
import TryIt from "./TryIt";
import Story from "./Story";
import useGmail from "./useGmail";
import useName from "./useName";

export default function Home() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const { name, loaded } = useName(gmail.connected);
  const [hasSession, setHasSession] = useState(false);
  const [notice, setNotice] = useState("");
  const [business, setBusiness] = useState("");

  const signedIn = gmail.loaded && gmail.connected && loaded && !!name;

  useEffect(() => {
    try {
      setHasSession(!!localStorage.getItem("plyde_session"));
    } catch {}
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
    if (loaded && gmail.loaded && gmail.connected && !name) router.replace("/welcome");
  }, [loaded, gmail, name, router]);

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const text = j.website || String(j.description || "").slice(0, 60);
        if (text) setBusiness(text);
      })
      .catch(() => {});
  }, [signedIn]);

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero">
        <h1>
          Find the <Rewrite /> that need you before anyone else does.
        </h1>
        <p className="lead">
          Plyde researches your market, finds companies that are still early, and drafts the
          outreach. You approve every message.
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
            <p className="greet">Welcome back, {name}.</p>
            {business && (
              <p className="note-s">
                Searching for: {business} · <Link href="/setup">Change</Link>
              </p>
            )}
            <div className="ctas">
              <Link className="cta" href="/campaign">
                Run a campaign
              </Link>
              <Link className="cta ghost" href="/go">
                Find clients faster
              </Link>
              {hasSession && (
                <Link className="cta ghost" href="/campaign/run">
                  Open your last campaign
                </Link>
              )}
            </div>
            <p className="note" style={{ marginTop: "16px" }}>
              <Link href="/credits">Credits</Link> · <Link href="/setup">Edit your setup</Link>
            </p>
          </>
        )}

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

        {gmail.loaded && !gmail.connected && <Story />}
      </section>
    </>
  );
          }
