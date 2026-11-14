"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../Header";
import useGmail from "../useGmail";

export default function NewCampaign() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !gmail.loaded) return;
    if (!gmail.connected) router.replace("/");
    else if (!name) router.replace("/welcome");
  }, [ready, gmail, name, router]);

  const canStart = website.trim() || description.trim();

  function start(e) {
    e.preventDefault();
    if (!canStart) return;
    try {
      localStorage.setItem(
        "plyde_campaign",
        JSON.stringify({
          website: website.trim(),
          description: description.trim(),
          startedAt: Date.now(),
        })
      );
      localStorage.removeItem("plyde_session");
    } catch {}
    router.push("/campaign/run");
  }

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">What are you selling?</h1>
        <p className="lead">
          Enter your website, or describe what you sell, what you are building or your brand.
          Either works.
        </p>
        <form className="stack" onSubmit={start}>
          <input
            className="bigin"
            type="text"
            placeholder="yourwebsite.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-label="Your website"
          />
          <p className="or">Or describe it:</p>
          <textarea
            className="desc"
            rows={5}
            placeholder="For example: I build websites for restaurants and cafes."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="ctas">
            <button className="cta" type="submit" disabled={!canStart}>
              Start campaign
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
