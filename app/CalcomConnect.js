"use client";

import { useEffect, useState } from "react";

export default function CalcomConnect() {
  const [info, setInfo] = useState(null);
  const [events, setEvents] = useState([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/calcom?events=1");
      const j = await r.json();
      setInfo(j);
      const list = j.events || [];
      setEvents(list);
      setPick(j.bookingUrl || (list[0] && list[0].url) || "");
      if (j.error) setMsg(j.error);
    } catch {
      setMsg("Network problem. Please try again.");
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("calcom");
    if (q === "denied") setMsg("Cal.com was not connected. You can try again any time.");
    if (q === "failed") setMsg("Something went wrong connecting Cal.com. Please try again.");
    if (q === "connected") setMsg("Cal.com connected. Choose your meeting type below.");
    if (q) window.history.replaceState({}, "", "/profile");
    load();
  }, []);

  async function choose() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/calcom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "choose", url: pick }),
      });
      const j = await r.json();
      setMsg(r.ok ? "Saved. Every email you send now includes this booking link." : j.error || "Could not save.");
      if (r.ok) load();
    } catch {
      setMsg("Network problem. Please try again.");
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Cal.com?")) return;
    setBusy(true);
    try {
      await fetch("/api/calcom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      setMsg("Disconnected.");
      load();
    } catch {
      setMsg("Network problem. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="plat" style={{ marginTop: "24px" }}>
      <h3>Cal.com</h3>
      {!info && <p className="note-s">Loading...</p>}

      {info && !info.connected && (
        <>
          <p className="note-s">
            Connect Cal.com once. Plyde adds your booking link to every email and marks a
            prospect as booked when they pick a time.
          </p>
          <div className="actions">
            <a className="btn solid" href="/api/calcom/connect">
              Connect Cal.com
            </a>
          </div>
        </>
      )}

      {info && info.connected && (
        <>
          {events.length > 0 ? (
            <>
              <label className="lbl">Which meeting type should prospects book?</label>
              <select className="in" value={pick} onChange={(e) => setPick(e.target.value)}>
                {events.map((e) => (
                  <option key={e.url} value={e.url}>
                    {e.name}
                    {e.minutes ? " (" + e.minutes + " min)" : ""}
                  </option>
                ))}
              </select>
              <div className="actions">
                <button className="btn solid" disabled={busy || !pick} onClick={choose}>
                  {busy ? "Saving..." : "Save meeting type"}
                </button>
              </div>
            </>
          ) : (
            <p className="note-s">No public meeting types found in your Cal.com account.</p>
          )}
          {info.eventName && <p className="note-s">In use: {info.eventName}</p>}
          <p className="note-s">
            {info.tracking
              ? "Booked calls are tracked automatically."
              : "Automatic booked-call tracking is not on for this account."}
          </p>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </>
      )}
      {msg && <p className="msg">{msg}</p>}
    </div>
  );
           }
