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

const field = {
  width: "100%",
  boxSizing: "border-box",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  fontFamily: "inherit",
};

const smallBtn = {
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "transparent",
  color: "#F8FAFC",
  fontSize: "14px",
  cursor: "pointer",
};

function scoreColor(score) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function Prospects() {
  const [profile, setProfile] = useState(null);
  const [target, setTarget] = useState("");
  const [manual, setManual] = useState("");
  const [urls, setUrls] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

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
    try {
      const saved = JSON.parse(localStorage.getItem("plyde_prospects") || "[]");
      setItems(saved);
    } catch {}
    setLoaded(true);
    window.addEventListener("plyde-profile", readProfile);
    return () => window.removeEventListener("plyde-profile", readProfile);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        "plyde_prospects",
        JSON.stringify(items.filter((i) => i.status === "done"))
      );
    } catch {}
  }, [items, loaded]);

  async function start() {
    setMsg("");
    const lines = urls.split("\n").map((s) => s.trim()).filter(Boolean);
    const unique = [...new Set(lines)].slice(0, 5);
    if (!unique.length) {
      setMsg("Paste at least one website.");
      return;
    }
    const summary = profile ? profile.business_summary : manual.trim();
    const tgt = profile ? target : manual.trim();
    if (!summary) {
      setMsg("First tell Plyde what you sell, using the box above or the description box.");
      return;
    }
    if (lines.length > 5) setMsg("Only the first 5 were used. Add the rest after these finish.");

    setBusy(true);
    const fresh = unique.map((u) => ({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      input: u,
      status: "loading",
    }));
    setItems((prev) => [...fresh, ...prev]);
    setUrls("");

    for (let i = 0; i < fresh.length; i++) {
      const it = fresh[i];
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: it.input, profile: { summary, target: tgt } }),
        });
        const json = await res.json();
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id
              ? res.ok
                ? { ...p, status: "done", data: json }
                : { ...p, status: "error", error: json.error || "Failed." }
              : p
          )
        );
      } catch {
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id ? { ...p, status: "error", error: "Network problem." } : p
          )
        );
      }
      if (i < fresh.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setBusy(false);
  }

  function remove(id) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  function clearAll() {
    setItems([]);
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "8px 0 48px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "6px" }}>Research prospects</h2>
      <p style={{ textAlign: "center", color: "#94A3B8", marginTop: 0, fontSize: "15px" }}>
        Paste websites of companies you want to reach, one per line (up to 5 at a time).
      </p>

      {profile ? (
        <div style={{ marginBottom: "12px" }}>
          <label style={{ color: "#94A3B8", fontSize: "14px" }}>
            Customer type you are targeting
          </label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ ...field, marginTop: "6px" }}
          >
            {(profile.segments || []).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <textarea
          placeholder="Describe what you sell and who you want to reach. (Or run the analysis above first.)"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          rows={3}
          style={{ ...field, marginBottom: "12px" }}
        />
      )}

      <textarea
        placeholder={"company-one.com\ncompany-two.com"}
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        rows={4}
        style={field}
      />
      <button
        onClick={start}
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
        {busy ? "Researching..." : "Research prospects"}
      </button>
      {msg && <p style={{ color: "#F59E0B", textAlign: "center" }}>{msg}</p>}

      <div style={{ marginTop: "24px" }}>
        {items.map((it) => {
          if (it.status === "loading") {
            return (
              <div key={it.id} style={card}>
                <strong>{it.input}</strong>
                <p style={{ color: "#94A3B8", margin: "8px 0 0" }}>Researching...</p>
              </div>
            );
          }
          if (it.status === "error") {
            return (
              <div key={it.id} style={card}>
                <strong>{it.input}</strong>
                <p style={{ color: "#F59E0B", margin: "8px 0" }}>{it.error}</p>
                <button onClick={() => remove(it.id)} style={smallBtn}>
                  Remove
                </button>
              </div>
            );
          }
          const d = it.data;
          return (
            <div key={it.id} style={card}>
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

              <div style={{ display: "flex", gap: "8px" }}>
                <a href={d.url} target="_blank" rel="noreferrer" style={{ ...smallBtn, textDecoration: "none" }}>
                  Visit site
                </a>
                <button onClick={() => remove(it.id)} style={smallBtn}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {items.length > 0 && !busy && (
          <p onClick={clearAll} style={{ textAlign: "center", color: "#64748B", fontSize: "13px", cursor: "pointer", textDecoration: "underline" }}>
            Clear all
          </p>
        )}
        {items.length > 0 && (
          <p style={{ textAlign: "center", color: "#64748B", fontSize: "13px" }}>
            Scores and reasons are AI estimates from each public website. Verify before you contact anyone.
          </p>
        )}
      </div>
    </div>
  );
  }
