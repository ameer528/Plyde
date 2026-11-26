"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./flow.css";
import "./header.css";
import "./account.css";
import markImg from "./mark-white.png";
import wordImg from "./word-white.png";

export default function Header({ gmail, name, onDisconnect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const source = String(name || gmail.email || "?").trim();
  const initial = (source.charAt(0) || "?").toUpperCase();

  function close() {
    setOpen(false);
  }

  return (
    <header className="bar">
      <Link href="/" className="brand">
        <img className="mark" src={markImg.src} alt="" />
        <img className="word" src={wordImg.src} alt="Plyde" />
      </Link>
      {gmail.loaded && gmail.connected && (
        <div className="acct" ref={ref}>
          <button
            type="button"
            className="acct-btn"
            aria-label="Account menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {initial}
          </button>
          {open && (
            <div className="acct-menu" role="menu">
              <div className="acct-who">
                {name ? <b>{name}</b> : null}
                <span>{gmail.email}</span>
              </div>
              <Link href="/" className="acct-item" onClick={close}>
                Home
              </Link>
              <Link href="/profile" className="acct-item" onClick={close}>
                Profile
              </Link>
              <Link href="/credits" className="acct-item" onClick={close}>
                Credits
              </Link>
              <Link href="/setup" className="acct-item" onClick={close}>
                Edit setup
              </Link>
              <button
                type="button"
                className="acct-item acct-out"
                onClick={() => {
                  close();
                  if (onDisconnect) onDisconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
              }
