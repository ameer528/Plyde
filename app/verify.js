import dns from "node:dns/promises";

const EMAIL_RE = /^[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/i;
const PLACEHOLDER =
  /^(you|your|name|email|user|username|john|jane|test|sample|someone|yourname)@|@(company|domain|example|email|yourcompany|yourdomain|website|site)\./i;
const DISPOSABLE = [
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com",
  "dispostable.com", "throwawaymail.com",
];
const ROLE = [
  "info", "hello", "contact", "support", "sales", "admin", "office",
  "team", "help", "enquiries", "inquiries", "hi",
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function verifyEmail(raw) {
  const email = String(raw || "").trim().toLowerCase().slice(0, 254);
  const note =
    "We checked the format and that the domain can receive email. A free check cannot confirm that the mailbox itself exists.";
  const m = email.match(EMAIL_RE);
  if (!m) {
    return { status: "invalid", reasons: ["This does not look like a valid email address."], note };
  }
  if (PLACEHOLDER.test(email)) {
    return { status: "invalid", reasons: ["This looks like placeholder text, not a real address."], note };
  }
  const domain = m[1];
  if (DISPOSABLE.includes(domain)) {
    return { status: "invalid", reasons: ["This is a throwaway email service."], note };
  }

  const reasons = [];
  let status = "ok";
  const local = email.split("@")[0];
  if (ROLE.includes(local)) {
    reasons.push(
      "This is a shared company inbox. It works, but the person reading it may not be a decision maker."
    );
  }

  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    if (!mx || mx.length === 0) throw Object.assign(new Error("none"), { code: "ENODATA" });
  } catch (e) {
    if (e && e.message === "timeout") {
      return {
        status: "risky",
        reasons: ["We could not check the domain right now. Try again before sending."],
        note,
      };
    }
    try {
      const a = await withTimeout(dns.resolve4(domain), 3000);
      if (a && a.length) {
        status = "risky";
        reasons.push("The domain has no mail server records, so this email may bounce.");
      } else {
        return { status: "invalid", reasons: ["This domain cannot receive email."], note };
      }
    } catch {
      return { status: "invalid", reasons: ["This domain cannot receive email."], note };
    }
  }

  return { status, reasons, note };
}
