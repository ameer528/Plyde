import { askAI } from "../../ai";

function cleanUrl(input) {
  let value = String(input || "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":") ||
    !host.includes(".");
  return blocked ? null : url;
}

async function allowedByRobots(url) {
  try {
    const res = await fetch(new URL("/robots.txt", url).toString(), {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return true;
    const text = await res.text();
    let applies = false;
    let blocked = false;
    for (const raw of text.split("\n")) {
      const line = raw.split("#")[0].trim();
      const parts = line.split(":");
      const key = (parts.shift() || "").trim().toLowerCase();
      const val = parts.join(":").trim();
      if (key === "user-agent") {
        applies = val === "*" || val.toLowerCase().includes("plydebot");
      } else if (applies && key === "disallow" && val === "/") {
        blocked = true;
      }
    }
    return !blocked;
  } catch {
    return true;
  }
}

async function getHtml(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "PlydeBot/0.1 (prospect research)" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return null;
    return (await res.text()).slice(0, 300000);
  } catch {
    return null;
  }
}

function textFrom(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const desc =
    (html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    ) || [])[1] || "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { title, desc, body };
}

const BAD_EMAIL =
  /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$|sentry|wixpress|example\.|yourdomain|domain\.com|@2x|^(you|your|name|email|user|username|john|jane|test|sample|someone|yourname|first\.?last)@|@(company|domain|example|email|yourcompany|yourdomain|website|site)\./i;

function findEmails(html, source, into) {
  const found =
    html.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || [];
  for (const raw of found) {
    const email = raw.toLowerCase();
    if (BAD_EMAIL.test(email)) continue;
    if (!into.some((x) => x.email === email)) into.push({ email, source });
  }
}

function displayName(title, label) {
  const first = String(title || "")
    .replace(/&amp;/g, "&")
    .split(/\s[|\-\u2013\u2014:\u00b7]\s/)[0]
    .trim();
  const generic = /^(home|welcome|homepage|index|untitled)$/i;
  if (first && first.length <= 40 && !generic.test(first)) return first;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function findPage(html, baseUrl, hrefPattern, labelPattern) {
  const links = html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of links) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ").trim();
    if (hrefPattern.test(href) || labelPattern.test(label)) {
      try {
        const u = new URL(href, baseUrl);
        if (
          (u.protocol === "https:" || u.protocol === "http:") &&
          u.hostname === new URL(baseUrl).hostname
        ) {
          return u.toString();
        }
      } catch {}
    }
  }
  return null;
}

const SOCIAL_HOSTS = [
  ["x", /^(?:www\.)?(?:x|twitter)\.com$/i],
  ["linkedin", /^(?:[a-z]{2,3}\.)?linkedin\.com$/i],
  ["instagram", /^(?:www\.)?instagram\.com$/i],
  ["tiktok", /^(?:www\.)?tiktok\.com$/i],
  ["facebook", /^(?:www\.|m\.)?facebook\.com$/i],
  ["youtube", /^(?:www\.)?youtube\.com$/i],
];

const BLOCKED_FIRST = [
  "intent", "share", "sharer", "sharer.php", "login", "signup", "dialog",
  "plugins", "hashtag", "search", "embed", "watch", "results", "i", "home",
  "policies", "legal", "explore", "tr", "p", "reel", "reels", "privacy",
  "help", "about", "settings", "tos", "ads",
];

function addSocial(raw, baseUrl, into) {
  let u;
  try {
    u = new URL(raw, baseUrl);
  } catch {
    return;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  const host = u.hostname.toLowerCase();
  for (const [key, pattern] of SOCIAL_HOSTS) {
    if (!pattern.test(host) || into[key]) continue;
    const first = (u.pathname.split("/")[1] || "").toLowerCase();
    if (!first || BLOCKED_FIRST.includes(first)) continue;
    if (key === "linkedin" && !["company", "school"].includes(first)) continue;
    if (key === "tiktok" && !first.startsWith("@")) continue;
    if (
      key === "youtube" &&
      !(first.startsWith("@") || ["channel", "c", "user"].includes(first))
    )
      continue;
    const outHost = key === "x" ? "x.com" : host;
    into[key] = ("https://" + outHost + u.pathname).replace(/\/$/, "");
  }
}

function findSocials(html, baseUrl, into) {
  const links = html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi);
  for (const m of links) addSocial(m[1], baseUrl, into);
    }
