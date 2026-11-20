import crypto from "node:crypto";
import { db, owner } from "./db";

export async function checkLimit(request, name, visitorLimit, userLimit) {
  const email = owner(request);
  let key;
  let limit;
  if (email) {
    key = name + ":u:" + email;
    limit = userLimit;
  } else {
    const ip = (request.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim();
    const hash = crypto
      .createHash("sha256")
      .update(ip + (process.env.SESSION_SECRET || ""))
      .digest("hex")
      .slice(0, 32);
    key = name + ":v:" + hash;
    limit = visitorLimit;
  }
  try {
    const { data, error } = await db().rpc("bump_usage", {
      p_key: key,
      p_limit: limit,
    });
    if (error) throw error;
    return { allowed: data === true, signedIn: !!email };
  } catch {
    return { allowed: !!email, signedIn: !!email };
  }
}
