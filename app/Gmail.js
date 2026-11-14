import crypto from "node:crypto";

export const SITE = "https://plyde.vercel.app";
export const REDIRECT = SITE + "/api/gmail/callback";

export const COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

function aesKey() {
  const secret = process.env.SESSION_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decrypt(token) {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function readSession(request) {
  const raw = request.cookies.get("plyde_gmail")?.value;
  if (!raw) return null;
  const plain = decrypt(raw);
  if (!plain) return null;
  try {
    const s = JSON.parse(plain);
    return s && s.rt ? s : null;
  } catch {
    return null;
  }
}
