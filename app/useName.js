"use client";

import { useState, useEffect, useCallback } from "react";

export default function useName(gmailConnected) {
  const [name, setNameState] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!gmailConnected) {
      setLoaded(true);
      return;
    }
    let cached = "";
    try {
      cached = localStorage.getItem("plyde_name") || "";
    } catch {}
    if (cached) setNameState(cached);

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.name) {
          setNameState(j.name);
          try {
            localStorage.setItem("plyde_name", j.name);
          } catch {}
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [gmailConnected]);

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

  return { name, loaded, save };
}
