"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "../Header";
import useGmail from "../useGmail";
import "../profile.css";

function label(r) {
  if (r.reason === "signup_bonus") return "Welcome credits";
  if (r.reason === "send") return "Email sent to " + (r.ref || "a prospect");
  if (r.reason === "refund") return "Refund, send failed (" + (r.ref || "") + ")";
  if (r.reason === "purchase") return "Credits purchased";
  if (r.reason === "admin") return "Credits added by Plyde";
  return r.reason;
}

function csv(history) {
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = ["Date,Description,Credits,Balance"];
  for (const r of history) {
    lines.push(
      [esc(new Date(r.created_at).toISOString()), esc(label(r)), r.delta, r.balance_after].join(",")
    );
  }
  return lines.join("\n");
}

export default function Credits() {
  const router = useRouter();
  const { gmail, disconnect } = useGmail();
  const [name, setName] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem("plyde_name") || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (gmail.loaded && !gmail.connected) router.replace("/");
  }, [gmail, router]);

  useEffect(() => {
    if (!gmail.loaded || !gmail.connected) return;
    fetch("/api/credits")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setData(j);
        else setError(j.error || "Could not load your credits.");
      })
      .catch(() => setError("Network problem. Please try again."));
  }, [gmail.loaded, gmail.connected]);

  function download() {
    const blob = new Blob([csv(data.history)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plyde-credits.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header gmail={gmail} name={name} onDisconnect={disconnect} />
      <section className="hero narrow">
        <h1 className="h1s">Your credits</h1>
        <p className="lead">
          Each email you send uses 1 credit. If an email fails to send, the credit is returned
          automatically.
        </p>
        {error && <p className="error">{error}</p>}

        {data && (
          <>
            <div className="stats">
              <div className="stat">
                <b>{data.balance}</b>
                <span>Credits left</span>
              </div>
              <div className="stat">
                <b>{data.used}</b>
                <span>Credits used</span>
              </div>
              <div className="stat">
                <b>{data.added}</b>
                <span>Credits received</span>
              </div>
            </div>

            <div className="plat" style={{ marginTop: "24px" }}>
              <h3>Need more credits?</h3>
              <p className="note-s">
                Online payments are coming soon. Until then, message us and we will add credits to
                your account, and the purchase will show in your history below.
              </p>
              <div className="actions">
                <button className="btn solid" disabled>
                  Buy credits (coming soon)
                </button>
              </div>
            </div>
          </>
        )}

        <div className="ctas">
          <Link className="cta" href="/campaign">
            Run a campaign
          </Link>
        </div>
      </section>

      <section className="paper">
        <div className="wrap">
          <h2>History</h2>
          {!data && !error && <p className="sub">Loading...</p>}
          {data && data.history.length === 0 && (
            <p className="sub">Nothing here yet. Your first send will appear here.</p>
          )}
          {data && data.history.length > 0 && (
            <>
              <div className="actions" style={{ marginBottom: "12px" }}>
                <button className="btn" onClick={download}>
                  Download as CSV
                </button>
              </div>
              {data.history.map((r) => (
                <div
                  key={r.id}
                  style={{
                    borderTop: "1px solid rgba(128,128,128,0.35)",
                    padding: "10px 0",
                  }}
                >
                  <p style={{ margin: "0 0 2px" }}>
                    <b>{r.delta > 0 ? "+" + r.delta : r.delta}</b> · {label(r)}
                  </p>
                  <p className="note-s" style={{ margin: 0 }}>
                    {new Date(r.created_at).toLocaleString()} · balance {r.balance_after}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </>
  );
    }
