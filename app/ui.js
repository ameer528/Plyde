export const card = {
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: "16px",
  padding: "18px",
  marginBottom: "14px",
  textAlign: "left",
};

export const field = {
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#1E293B",
  color: "#F8FAFC",
  fontSize: "16px",
  fontFamily: "inherit",
};

export const ghost = {
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

export const solid = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #7C3AED, #0EA5E9)",
  color: "#F8FAFC",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

export const LABELS = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
};

export const STAGES = {
  early: "Early stage",
  growing: "Growing",
};

export function scoreColor(score) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function post(path, body) {
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
