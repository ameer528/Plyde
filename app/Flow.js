"use client";

import { useState } from "react";

const card = {
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "18px",
  marginBottom: "14px",
  textAlign: "left",
};

const field = {
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  fontFamily: "inherit",
};

const ghost = {
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1px solid #334155",
  background: "transparent",
  color: "#F8FAFC",
  fontSize: "14px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

const LABELS = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};

function scoreColor(score) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {}
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "Network problem. Please try again." } };
  }
}

function Drafts({ d, copy, copied }) {
  const drafts = d.drafts || {};
  const email = drafts.email;
  const firstEmail = d.emails && d.emails[0] ? d.emails[0].email : "";
  const gmail = email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(firstEmail)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
    : "";

  return (
    <div>
      {email && (
        <details style={{ marginBottom: "8px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Email draft</summary>
          <p style={{ margin: "10px 0 4px", fontWeight: 600 }}>Subject: {email.subject}</p>
          <p style={{ margin: "0 0 10px", color: "#CBD5E1", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {email.body}
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              style={ghost}
              onClick={() => copy(d.site + "-email", `Subject: ${email.subject}\n\n${email.body}`)}
            >
              {copied === d.site + "-email" ? "Copied" : "Copy"}
            </button>
            {firstEmail ? (
              <a href={gmail} target="_blank" rel="noreferrer" style={ghost}>
                Open in Gmail
              </a>
            ) : (
              <span style={{ color: "#94A3B8", fontSize: "13px", alignSelf: "center" }}>
                No public email found, so use their contact page.
              </span>
            )}
          </div>
        </details>
      )}
      {Object.keys(LABELS).map((key) => {
        if (!drafts[key] || !d.socials || !d.socials[key]) return null;
        const id = d.site + "-" + key;
        return (
          <details key={key} style={{ marginBottom: "8px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{LABELS[key]} message</summary>
            <p style={{ margin: "10px 0", color: "#CBD5E1", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {drafts[key]}
            </p>
            <button style={ghost} onClick={() => copy(id, drafts[key], d.socials[key])}>
              {copied === id ? "Copied" : `Copy and open ${LABELS[key]}`}
            </button>
          </details>
        );
      })}
    </div>
  );
}

export default function Flow() {
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [market, setMarket] = useState(null);
  const [cards, setCards] = useState([]);
  const [skipped, setSkipped] = useState(0);
  const [copied, setCopied] = useState("");

  const canRun = website.trim() || description.trim();

  async function copy(key, text, openUrl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
    if (openUrl) window.open(openUrl, "_blank", "noopener");
  }

  function stop(message) {
    setError(message);
    setStep("");
    setBusy(false);
  }

  async function run(e) {
    e.preventDefault();
    setError("");
    setProfile(null);
    setMarket(null);
    setCards([]);
    setSkipped(0);
    setBusy(true);

    setStep("Reading your website...");
    const a = await post("/api/analyze", { website, description });
    if (!a.ok) {
      if (a.json.needsDescription) setShowDesc(true);
      return stop(a.json.error || "Something went wrong.");
    }
    const prof = a.json.result;
    const ownHost = a.json.site === "this business" ? "" : a.json.site.replace(/^www\./, "");
    setProfile(prof);
    try {
      localStorage.setItem("plyde_profile", JSON.stringify(prof));
    } catch {}
    const summary = prof.business_summary || "";
    const target = prof.segments && prof.segments[0] ? prof.segments[0].name : "";

    setStep("Checking your competitors...");
    const m = await post("/api/competitors", { profile: { summary }, host: ownHost });
    let edge = "";
    if (m.ok) {
      setMarket(m.json);
      edge = (m.json.differentiators || []).join("; ");
    }

    setStep("Finding companies that need your service...");
    const d = await post("/api/discover", { profile: { summary, target } });
    if (!d.ok) return stop(d.json.error || "Search failed.");
    const sites = (d.json.sites || [])
      .filter((s) => s.host.replace(/^www\./, "") !== ownHost)
      .slice(0, 5);

    const found = [];
    let failed = 0;
    for (let i = 0; i < sites.length; i++) {
      setStep(`Researching ${sites[i].host} (${i + 1} of ${sites.length})...`);
      const r = await post("/api/research", {
        website: sites[i].url,
        profile: { summary, target, edge },
      });
      if (r.ok) {
        found.push(r.json);
        setCards([...found].sort((x, y) => y.fit_score - x.fit_score));
      } else {
        failed++;
        setSkipped(failed);
      }
      if (i < sites.length - 1) await new Promise((res) => setTimeout(res, 1500));
    }
    setStep("");
    setBusy(false);
    if (!found.length) setError("None of the companies found could be researched. Please try again.");
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "left" }}>
      <form onSubmit={run}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Your website, e.g. yourbusiness.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ ...field, flex: 1, minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={busy || !canRun}
            style={{
              padding: "14px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
              color: "#F8FAFC",
              fontWeight: 600,
              fontSize: "16px",
              opacity: busy || !canRun ? 0.6 : 1,
            }}
          >
            {busy ? "..." : "Start"}
          </button>
        </div>
        {!showDesc && (
          <p
            onClick={() => setShowDesc(true)}
            style={{ color: "#94A3B8", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }}
          >
            No website? Describe what you sell instead
          </p>
        )}
        {showDesc && (
          <textarea
            placeholder="Describe what you sell and who you help."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{ ...field, width: "100%", boxSizing: "border-box", marginTop: "12px" }}
          />
        )}
      </form>

      {step && <p style={{ color: "#94A3B8", textAlign: "center", marginTop: "20px" }}>{step}</p>}
      {error && <p style={{ color: "#F59E0B", textAlign: "center", marginTop: "20px" }}>{error}</p>}

      {profile && (
        <div style={{ marginTop: "28px" }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>What you sell</h3>
            <p style={{ margin: 0, color: "#CBD5E1", lineHeight: 1.5 }}>{profile.business_summary}</p>
          </div>

          {market && (
            <div style={card}>
              <h3 style={{ margin: "0 0 8px" }}>Your market</h3>
              {market.competitors && market.competitors.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#CBD5E1" }}>Competitors found</strong>
                  {market.competitors.map((c) => (
                    <div key={c.url || c.name} style={{ color: "#94A3B8", fontSize: "14px", marginTop: "4px" }}>
                      <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9" }}>
                        {c.name}
                      </a>
                      {c.note ? ` - ${c.note}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {market.differentiators && market.differentiators.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#CBD5E1" }}>How you could stand out</strong>
                  {market.differentiators.map((p) => (
                    <div key={p} style={{ color: "#94A3B8", fontSize: "14px", marginTop: "4px" }}>
                      - {p}
                    </div>
                  ))}
                </div>
              )}
              {market.positioning && (
                <p style={{ margin: 0, color: "#CBD5E1", fontSize: "14px", lineHeight: 1.5 }}>
                  {market.positioning}
                </p>
              )}
              <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: "12px" }}>
                AI inference from web search results. Check it before relying on it.
              </p>
            </div>
          )}
        </div>
      )}

      {cards.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <h3 style={{ textAlign: "center" }}>Companies that may need you</h3>
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
              <p style={{ color: "#CBD5E1", margin: "10px 0 6px", lineHeight: 1.5 }}>{d.company_summary}</p>
              <p style={{ color: "#94A3B8", margin: "0 0 6px", fontSize: "14px", lineHeight: 1.5 }}>
                <strong style={{ color: "#CBD5E1" }}>Why they might need you: </strong>
                {d.fit_reason}
              </p>
              <p style={{ color: "#94A3B8", margin: "0 0 12px", fontSize: "14px" }}>
                <strong style={{ color: "#CBD5E1" }}>Evidence: </strong>
                {d.evidence} (AI confidence: {d.confidence})
              </p>

              <div style={{ fontSize: "14px", marginBottom: "12px" }}>
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
                        Their contact page
                      </a>
                    )}
                  </span>
                )}
                {d.socials && Object.keys(d.socials).length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {Object.keys(d.socials).map((k) => (
                      <a key={k} href={d.socials[k]} target="_blank" rel="noreferrer" style={ghost}>
                        {LABELS[k]}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <Drafts d={d} copy={copy} copied={copied} />
            </div>
          ))}
          <p style={{ textAlign: "center", color: "#64748B", fontSize: "13px" }}>
            {skipped > 0 ? `${skipped} site(s) could not be read and were skipped. ` : ""}
            Scores and drafts are AI-written from public websites. Review everything before you send.
          </p>
        </div>
      )}
    </div>
  );
    }
