"use client";

import { useState, useEffect, useCallback } from "react";

export default function useName(gmailConnected) {
  const connected = !!gmailConnected;
  const [name, setNameState] = useState("");
  const [doneFor, setDoneFor] = useState(null);

  useEffect(() => {
    if (!connected) {
      setNameState("");
      setDoneFor(false);
      return;
    }
    let cancelled = false;
    let cached = "";
    try {
      cached = localStorage.getItem("plyde_name") || "";
    } catch {}
    if (cached) setNameState(cached);

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (j && j.name) {
          setNameState(j.name);
          try {
            localStorage.setItem("plyde_name", j.name);
          } catch {}
        } else if (j && cached) {
          fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: cached }),
          }).catch(() => {});
        }
        setDoneFor(true);
      })
      .catch(() => {
        if (!cancelled) setDoneFor(true);
      });

    return () => {
      cancelled = true;
    };
  }, [connected]);

  const save = useCallback(async (value) => {
    const trimmed = value.trim().slice(0, 60);
    setNameState(trimmed);
    try {
      localStorage.setItem("plyde_name", trimmed);
    } catch {}
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {}
  }, []);

  return { name, loaded: doneFor === connected, save };
}
