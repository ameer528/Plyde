"use client";

import { useState, useEffect } from "react";

const card = {
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "18px",
  marginBottom: "14px",
  textAlign: "left",
};

const smallBtn = {
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "transparent",
  color: "#F8FAFC",
  fontSize: "14px",
  cursor: "pointer",
  textDecoration: "none",
};

function scoreColor(score) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function Discover() {
  const [profile, setProfile] = useState(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cards, setCards] = useState([]);
  const [skipped, setSkipped] = useState(0);

  function readProfile() {
    try {
      const p = JSON.parse(localStorage.getItem("plyde_profile") || "null");
      if (p && p.business_summary) {
        setProfile(p);
        setTarget((t) => t || (p.segments && p.segments[0] ? p.segments[0].name : ""));
      }
    } catch {}
  }

  useEffect(() => {
    readProfile();
    window.addEventListener("plyde-profile", readProfile);
    return () => window.removeEventListener("plyde-profile", readProfile);
  }, []);

  async function run() {
    setError("");
    setCards([]);
    setSkipped(0);
    setBusy(true);
    setStatus("Searching the web for companies like your ideal customers...");

    let sites = [];
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { summary: profile.business_summary, target },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Search failed.");
        setBusy(false);
        setStatus("");
        return;
      }
      sites = json.sites.slice(0, 5);
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
      setStatus("");
      return;
    }

    const found = [];
    let failed = 0;
    for (let i = 0; i < sites.length; i++) {
      setStatus(`Researching ${sites[i].host} (${i + 1} of ${sites.length})...`);
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            website: sites[i].url,
            profile: { summary: profile.business_summary, target },
          }),
        });
        const json = await res.json();
        if (res.ok) {
          found.push(json);
          setCards([...found].sort((a, b) => b.fit_score - a.fit_score));
        } else {
          failed++;
          setSkipped(failed);
        }
      } catch {
        failed++;
        setSkipped(failed);
      }
      if (i < sites.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setStatus("");
    setBusy(false);
    if (!found.length) setError("None of the companies found could be researched. Try again or pick another customer type.");
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "8px 0 24px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "6px" }}>Find prospects for me</h2>
        <p style={{ color: "#94A3B8", fontSize: "15px" }}>
          First run the analysis above so Plyde knows what you sell.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "8px 0 24px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "6px" }}>Find prospects for me</h2>
      <p style={{ textAlign: "center", color: "#94A3B8", marginTop: 0, fontSize: "15px" }}>
        Plyde searches the web for companies that match, then researches them.
      </p>

      <label style={{ color: "#94A3B8", fontSize: "14px" }}>Customer type to find</label>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginTop: "6px",
          padding: "14px",
          borderRadius: "12px",
          border: "1px solid #334155",
          background: "#1E293B",
          color: "#F8FAFC",
          fontSize: "16px",
        }}
      >
        {(profile.segments || []).map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>

      <button
        onClick={run}
        disabled={busy}
        style={{
          width: "100%",
          marginTop: "12px",
          padding: "14px",
          borderRadius: "12px",
          border: "none",
          background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
          color: "#F8FAFC",
          fontWeight: 600,
          fontSize: "16px",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Working..." : "Find prospects for me"}
      </button>

      {status && <p style={{ color: "#94A3B8", textAlign: "center" }}>{status}</p>}
      {error && <p style={{ color: "#F59E0B", textAlign: "center" }}>{error}</p>}

      <div style={{ marginTop: "20px" }}>
        {cards.map((d) => (
          <div key={d.site} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <strong style={{ wordBreak: "break-all" }}>{d.site}</strong>
              <span
                style={{
                  background: scoreColor(d.fit_score),
                  color: "#0F172A",
                  fontWeight: 700,
                  borderRadius: "8px",
                  padding: "2px 10px",
                  height: "fit-content",
                }}
              >
                {d.fit_score}%
              </span>
            </div>
            <p style={{ color: "#CBD5E1", margin: "10px 0 6px", lineHeight: 1.5 }}>
              {d.company_summary}
            </p>
            <p style={{ color: "#94A3B8", margin: "0 0 6px", fontSize: "14px", lineHeight: 1.5 }}>
              <strong style={{ color: "#CBD5E1" }}>Why they might need you: </strong>
              {d.fit_reason}
            </p>
            <p style={{ color: "#94A3B8", margin: "0 0 10px", fontSize: "14px" }}>
              <strong style={{ color: "#CBD5E1" }}>Evidence: </strong>
              {d.evidence} (AI confidence: {d.confidence})
            </p>
            <div style={{ fontSize: "14px", marginBottom: "10px" }}>
              <strong style={{ color: "#CBD5E1" }}>Public contact: </strong>
              {d.emails && d.emails.length > 0 ? (
                d.emails.map((m) => (
                  <div key={m.email} style={{ color: "#94A3B8" }}>
                    {m.email}{" "}
                    <a href={m.source} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                      (source)
                    </a>
                  </div>
                ))
              ) : (
                <span style={{ color: "#94A3B8" }}>
                  No public email found.{" "}
                  {d.contact_page && (
                    <a href={d.contact_page} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                      Open their contact page
                    </a>
                  )}
                </span>
              )}
            </div>
            <a href={d.url} target="_blank" rel="noreferrer" style={smallBtn}>
              Visit site
            </a>
          </div>
        ))}
        {cards.length > 0 && (
          <p style={{ textAlign: "center", color: "#64748B", fontSize: "13px" }}>
            {skipped > 0 ? `${skipped} site(s) could not be read and were skipped. ` : ""}
            Scores are AI estimates from public websites. Verify before you contact anyone.
          </p>
        )}
      </div>
    </div>
  );
          }
