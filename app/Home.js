"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "./Header";
import Rewrite from "./Rewrite";
import TryIt from "./TryIt";
import useGmail from "./useGmail";
import useName from "./useName";

export default function Home() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const { name, loaded } = useName(gmail.connected);
  const [hasSession, setHasSession] = useState(false);
  const [notice, setNotice] = useState("");

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

        {gmail.loaded && gmail.connected && loaded && name && (
          <>
            <p className="greet">Welcome back, {name}.</p>
            <div className="ctas">
              <Link className="cta" href="/campaign">
                Run a campaign
              </Link>
              {hasSession && (
                <Link className="cta ghost" href="/campaign/run">
                  Open your last campaign
                </Link>
              )}
            </div>
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
      </section>
    </>
  );
          }
