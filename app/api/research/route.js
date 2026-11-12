const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

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
  /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$|sentry|wixpress|example\.|yourdomain|domain\.com|@2x/i;

function findEmails(html, source, into) {
  const found =
    html.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || [];
  for (const raw of found) {
    const email = raw.toLowerCase();
    if (BAD_EMAIL.test(email)) continue;
    if (!into.some((x) => x.email === email)) into.push({ email, source });
  }
}

function findContactPage(html, baseUrl) {
  const links = html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of links) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ");
    if (/contact/i.test(href) || /contact/i.test(label)) {
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

function buildPrompt(host, profile, siteText) {
  return `You are a careful sales research assistant.

The user sells: ${profile.summary}
The user wants to reach: ${profile.target || "businesses that need this service"}

Below is text from the website of a possible prospect (${host}). Use ONLY this text. Never invent facts. If you are inferring something, use words like "possibly" or "may". Do not include any contact details.

${siteText}

Return ONLY valid JSON in exactly this shape:
{
  "company_summary": "1-2 sentences on what this company does, only from the text",
  "fit_score": 0-100,
  "fit_reason": "1-2 sentences on why they might need the user's service",
  "evidence": "a short paraphrase of something on their site that supports your reasoning, or 'none found'",
  "confidence": "low, medium or high"
}`;
}

async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "The AI key is missing on the server." };
  let lastStatus = 0;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      lastStatus = res.status;
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      return { result: JSON.parse(clean) };
    } catch {
      continue;
    }
  }
  if (lastStatus === 429) {
    return { error: "The free AI limit was reached. Wait a few minutes and try again." };
  }
  return { error: "The AI could not answer right now." };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const url = cleanUrl(body.website);
  if (!url) {
    return Response.json({ error: "That is not a valid website." }, { status: 400 });
  }
  const profile = {
    summary: String(body.profile?.summary || "").slice(0, 1500),
    target: String(body.profile?.target || "").slice(0, 300),
  };
  if (!profile.summary) {
    return Response.json({ error: "Missing your business profile." }, { status: 400 });
  }

  if (!(await allowedByRobots(url))) {
    return Response.json(
      { error: "This site asks automated tools not to read it, so we skipped it." },
      { status: 422 }
    );
  }

  const homeHtml = await getHtml(url.toString());
  if (!homeHtml) {
    return Response.json({ error: "We could not read this website." }, { status: 422 });
  }

  const home = textFrom(homeHtml);
  const emails = [];
  findEmails(homeHtml, url.toString(), emails);

  const contactPage = findContactPage(homeHtml, url.toString());
  let contactText = "";
  if (contactPage) {
    const contactHtml = await getHtml(contactPage);
    if (contactHtml) {
      findEmails(contactHtml, contactPage, emails);
      contactText = textFrom(contactHtml).body.slice(0, 1500);
    }
  }

  if (home.body.length < 150 && home.desc.length < 40) {
    return Response.json(
      { error: "This site loads its content in a way we cannot read." },
      { status: 422 }
    );
  }

  const siteText = `Title: ${home.title}\nDescription: ${home.desc}\nPage text: ${home.body.slice(0, 4500)}\nContact page text: ${contactText}`;
  const answer = await askGemini(buildPrompt(url.hostname, profile, siteText));
  if (answer.error) {
    return Response.json({ error: answer.error }, { status: 502 });
  }

  const r = answer.result || {};
  const score = Math.max(0, Math.min(100, Number(r.fit_score) || 0));
  return Response.json({
    site: url.hostname,
    url: url.toString(),
    company_summary: r.company_summary || "",
    fit_score: score,
    fit_reason: r.fit_reason || "",
    evidence: r.evidence || "none found",
    confidence: r.confidence || "low",
    emails: emails.slice(0, 3),
    contact_page: contactPage,
  });
  }
