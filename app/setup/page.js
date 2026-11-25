"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../Header";
import useGmail from "../useGmail";

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export default function Setup() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [limit, setLimit] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initial = useRef("");

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (!gmail.loaded || !gmail.connected) return;
    let cached = "";
    try {
      cached = localStorage.getItem("plyde_name") || "";
    } catch {}
    const old = readJson("plyde_campaign") || {};
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const w = (j && j.website) || old.website || "";
        const d = (j && j.description) || old.description || "";
        setName((j && j.name) || cached);
        setWebsite(w);
        setDescription(d);
        setLink((j && j.bookingLink) || "");
        setLimit(String((j && j.dailyLimit) || 20));
        initial.current = w.trim() + "|" + d.trim();
      })
      .catch(() => setName(cached));
  }, [gmail.loaded, gmail.connected]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const n = name.trim();
    const w = website.trim();
    const d = description.trim();
    const l = link.trim();
    const lim = Math.round(Number(limit));
    if (!n) {
      setError("Add the name that should go on your emails.");
      return;
    }
    if (!w && !d) {
      setError("Add your website, or describe what you sell.");
      return;
    }
    if (l && !/^https:\/\/\S+$/i.test(l)) {
      setError("The booking link must start with https:// and have no spaces.");
      return;
    }
    if (!(lim >= 1)) {
      setError("Emails per day must be at least 1.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          website: w,
          description: d,
          bookingLink: l,
          dailyLimit: lim,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || "Could not save. Try again.");
        setBusy(false);
        return;
      }
      try {
        localStorage.setItem("plyde_name", n);
        localStorage.setItem("plyde_campaign", JSON.stringify({ website: w, description: d }));
        if (w + "|" + d !== initial.current) localStorage.removeItem("plyde_go");
      } catch {}
      router.push("/go");
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Header gmail={gmail} name="" onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">Set up Plyde in one minute.</h1>
        <p className="lead">You only do this once. You can change it any time.</p>
        <form onSubmit={submit}>
          <label className="lbl">Your name (goes on your emails)</label>
          <input className="in" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="lbl">Your website</label>
          <input
            className="in"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="example.com"
          />

          <label className="lbl">No website? Describe what you sell</label>
          <textarea
            className="ta"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="I build websites for small businesses..."
          />

          <label className="lbl">Booking link (optional, Calendly or Cal.com)</label>
          <input
            className="in"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://calendly.com/your-name/intro"
          />
          <p className="note-s">
            Want it connected instead of pasted? You can do that later in Settings.
          </p>

          <label className="lbl">Emails to send per day (1 to 1000)</label>
          <input
            className="in"
            type="number"
            min="1"
            max="1000"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <p className="note-s">
            Start at 20 and raise it slowly. Gmail has its own daily cap (about 2,000 on paid
            Google Workspace, lower on free Gmail), and a sudden jump in volume can get your
            account flagged. Plyde sends one email at a time, so large batches take hours and the
            page has to stay open.
          </p>

          <div className="actions">
            <button className="btn solid" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save and find clients"}
            </button>
          </div>
          {error && <p className="msg">{error}</p>}
        </form>
      </section>
    </>
  );
    }
