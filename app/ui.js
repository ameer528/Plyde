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

export function socialLabel(key, url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const first = (parts[0] || "").replace(/^@/, "");
    if (key === "x" || key === "instagram" || key === "tiktok") {
      return first ? "@" + first : LABELS[key];
    }
    if (key === "linkedin") return parts[1] || parts[0] || LABELS[key];
    if (key === "youtube") {
      return (parts[0] || "").startsWith("@") ? parts[0] : parts[1] || parts[0] || LABELS[key];
    }
    return parts[0] || LABELS[key];
  } catch {
    return LABELS[key];
  }
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
