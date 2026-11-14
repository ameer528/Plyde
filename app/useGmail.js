"use client";

import { useState, useEffect, useCallback } from "react";

export default function useGmail() {
  const [gmail, setGmail] = useState({ connected: false, email: "", loaded: false });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status");
      const j = await res.json();
      setGmail({ connected: !!j.connected, email: j.email || "", loaded: true });
    } catch {
      setGmail((g) => ({ ...g, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function disconnect() {
    try {
      await fetch("/api/gmail/status", { method: "DELETE" });
    } catch {}
    await refresh();
  }

  return { gmail, refresh, disconnect };
}
