"use client";

import { useState } from "react";
import { post } from "./ui";

const card = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: "14px",
  padding: "16px",
  marginTop: "16px",
};

export default function TryIt() {
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [needsDesc, setNeedsDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  async function run(e) {
    if (e) e.preventDefault();
    setError("");
    setData(null);
    if (!website.trim() && !description.trim()) {
      setError("Enter your website, or describe what you sell.");
      return;
    }
    setBusy(true);
    const r = await post("/api/analyze", {
      website: website.trim(),
      description: description.trim(),
    });
    setBusy(false);
    if (r.ok) {
      setData(r.json);
      return;
    }
    const j = r.json || {};
    if (j.needsDescription) setNeedsDesc(true);
    setError(j.error || "Something went wrong. Please try again.");
  }

  const result = data && data.result;
  const segments = result && Array.isArray(result.segments) ? result.segments.slice(0, 3) : [];
  const email = result && result.sample_email;

  return (
    <div style={{ marginTop: "28px", maxWidth: "640px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: "20px" }}>Try it free, no sign-up</h2>
      <p className="note" style={{ margin: "0 0 12px" }}>
        See who Plyde thinks needs your service, plus a sample email. It takes about 20 seconds.
      </p>

      <form onSubmit={run}>
        <input
          className="in"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Your website, like example.com"
          aria-label="Your website"
        />
        {needsDesc && (
          <textarea
            className="ta"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you sell in a few sentences"
            aria-label="What you sell"
          />
        )}
        <div className="actions">
          <button className="btn solid" type="submit" disabled={busy}>
            {busy ? "Analyzing..." : "Analyze my business"}
          </button>
          {!needsDesc && (
            <button className="btn" type="button" onClick={() => setNeedsDesc(true)}>
              No website? Describe it
            </button>
          )}
        </div>
      </form>

      {error && <p className="msg">{error}</p>}

      {result && (
        <div style={card}>
          <p style={{ margin: "0 0 8px" }}>
            <b>What you do</b>
          </p>
          <p style={{ margin: "0 0 14px" }}>{result.business_summary}</p>

          {segments.length > 0 && (
            <>
              <p style={{ margin: "0 0 8px" }}>
                <b>Who may need you</b>
              </p>
              {segments.map((s, i) => (
                <p key={i} style={{ margin: "0 0 10px" }}>
                  {s.name} ({s.fit_score}% fit)
                  <br />
                  <span className="note-s">{s.reason}</span>
                </p>
              ))}
            </>
          )}

          {email && email.body && (
            <>
              <p style={{ margin: "14px 0 8px" }}>
                <b>A sample email</b>
              </p>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{email.subject}</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{email.body}</p>
            </>
          )}

          <p className="note-s" style={{ marginTop: "14px" }}>
            Written by AI from public information, so check it before you use it.
          </p>
          <div className="actions">
            <a className="btn solid" href="/api/gmail/connect">
              Connect Gmail to find real companies
            </a>
          </div>
        </div>
      )}
    </div>
  );
    }
