"use client";

import { useState } from "react";

const card = {
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "20px",
  marginBottom: "16px",
  textAlign: "left",
};

const input = {
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  fontFamily: "inherit",
};

export default function Analyzer() {
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = website.trim() || description.trim();

  async function analyze(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, description }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        if (json.needsDescription) setShowDescription(true);
      } else {
        setData(json); try { localStorage.setItem("plyde_profile", JSON.stringify(json.result)); window.dispatchEvent(new Event("plyde-profile")); } catch {}
      }
    } catch {
      setError("Network problem. Please try again.");
    }
    setLoading(false);
  }

  async function copyEmail() {
    const mail = data.result.sample_email;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${mail.subject}\n\n${mail.body}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const result = data ? data.result : null;

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto" }}>
      <form onSubmit={analyze}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Your website, e.g. yourbusiness.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ ...input, flex: 1, minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={loading || !canSubmit}
            style={{
              padding: "14px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
              color: "#F8FAFC",
              fontWeight: 600,
              fontSize: "16px",
              opacity: loading || !canSubmit ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Find"}
          </button>
        </div>

        {!showDescription && (
          <p
            onClick={() => setShowDescription(true)}
            style={{
              color: "#94A3B8",
              fontSize: "14px",
              cursor: "pointer",
              textDecoration: "underline",
              marginTop: "12px",
            }}
          >
            No website? Describe what you sell instead
          </p>
        )}

        {showDescription && (
          <textarea
            placeholder="Describe what you sell and who you help. Example: I design websites for local restaurants and cafes."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{
              ...input,
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              resize: "vertical",
            }}
          />
        )}
      </form>

      {loading && (
        <p style={{ color: "#94A3B8", marginTop: "20px" }}>
          Thinking. This takes about 10 seconds...
        </p>
      )}

      {error && (
        <p style={{ color: "#F59E0B", marginTop: "20px" }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: "28px" }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>What you sell</h3>
            <p style={{ margin: 0, color: "#CBD5E1", lineHeight: 1.5 }}>
              {result.business_summary}
            </p>
          </div>

          <div style={card}>
            <h3 style={{ margin: "0 0 12px" }}>Who is likely to buy</h3>
            {(result.segments || []).map((s) => (
              <div key={s.name} style={{ marginBottom: "14px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 600,
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ color: "#7C3AED" }}>{s.fit_score}%</span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "#334155",
                    borderRadius: "3px",
                    margin: "6px 0",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, s.fit_score))}%`,
                      height: "100%",
                      borderRadius: "3px",
                      background: "linear-gradient(90deg, #7C3AED, #0EA5E9)",
                    }}
                  />
                </div>
                <div style={{ color: "#94A3B8", fontSize: "14px" }}>
                  {s.reason}
                </div>
              </div>
            ))}
          </div>

          {result.sample_email && (
            <div style={card}>
              <h3 style={{ margin: "0 0 4px" }}>Sample email</h3>
              <p style={{ margin: "0 0 12px", color: "#94A3B8", fontSize: "14px" }}>
                For: {result.sample_email.target_segment}
              </p>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                Subject: {result.sample_email.subject}
              </p>
              <p
                style={{
                  margin: "0 0 14px",
                  color: "#CBD5E1",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {result.sample_email.body}
              </p>
              <button
                onClick={copyEmail}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#F8FAFC",
                  fontSize: "14px",
                }}
              >
                {copied ? "Copied" : "Copy email"}
              </button>
            </div>
          )}

          <p style={{ color: "#64748B", fontSize: "13px", textAlign: "center" }}>
            These are AI suggestions based on what you provided. Check them
            before using them.
          </p>
        </div>
      )}
    </div>
  );
              }
