import { createClient } from "@supabase/supabase-js";
import { readSession } from "./gmail";

let client = null;

export function db() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client;
}

export function owner(request) {
  const s = readSession(request);
  const email = s && s.email ? String(s.email).toLowerCase() : "";
  return email || null;
}
