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

function findMetaHandle(html, into) {
  const m =
    html.match(/<meta[^>]+name=["']twitter:site["'][^>]+content=["']@?([A-Za-z0-9_]{1,15})["']/i) ||
    html.match(/<meta[^>]+content=["']@?([A-Za-z0-9_]{1,15})["'][^>]+name=["']twitter:site["']/i);
  if (m && !into.x) into.x = "https://x.com/" + m[1];
}

function findJsonLd(html, baseUrl, into) {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of blocks) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const stack = [data];
    let guard = 0;
    while (stack.length && guard++ < 500) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        for (const n of node) stack.push(n);
        continue;
      }
      if (node && typeof node === "object") {
        if (node.sameAs) {
          const list = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
          for (const u of list) if (typeof u === "string") addSocial(u, baseUrl, into);
        }
        for (const k of Object.keys(node)) {
          const v = node[k];
          if (v && typeof v === "object") stack.push(v);
        }
      }
    }
  }
}

function collectSocials(html, baseUrl, into) {
  findSocials(html, baseUrl, into);
  findMetaHandle(html, into);
  findJsonLd(html, baseUrl, into);
}

function lettersOnly(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

function linkedinSlugs(pages) {
  const slugs = [];
  for (const p of pages) {
    const found = p.html.matchAll(/linkedin\.com\/in\/([a-z0-9%\-_.]+)/gi);
    for (const m of found) {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs;
}

function verifyPeople(rawPeople, pages, emails) {
  const out = [];
  const slugs = linkedinSlugs(pages);
  for (const p of Array.isArray(rawPeople) ? rawPeople : []) {
    const name = String(p.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const title = String(p.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const tokens = name.split(" ").filter(Boolean);
    if (tokens.length < 2 || !title) continue;
    const lower = name.toLowerCase();
    const page = pages.find((pg) => pg.body.toLowerCase().includes(lower));
    if (!page) continue;
    if (out.some((x) => x.name.toLowerCase() === lower)) continue;

    const first = lettersOnly(tokens[0]);
    const last = lettersOnly(tokens[tokens.length - 1]);
    let email = "";
    let emailSource = "";
    for (const e of emails) {
      const local = e.email.split("@")[0];
      const l = lettersOnly(local);
      if ((first.length >= 3 && l.includes(first)) || (last.length >= 3 && l.includes(last))) {
        email = e.email;
        emailSource = e.source;
        break;
      }
    }
    let linkedin = "";
    for (const slug of slugs) {
      const s = lettersOnly(slug);
      if (first.length >= 2 && last.length >= 2 && s.includes(first) && s.includes(last)) {
        linkedin = "https://www.linkedin.com/in/" + slug;
        break;
      }
    }
    out.push({ name, title, source: page.url, email, emailSource, linkedin });
    if (out.length >= 4) break;
  }
  return out;
}

function fixGreeting(body, companyName, firstName) {
  const greeting = firstName ? `Hi ${firstName},` : `Hi ${companyName} team,`;
  const lines = String(body || "").split("\n");
  if (/^\s*(hi|hello|hey|dear)\b/i.test(lines[0] || "")) {
    lines[0] = greeting;
  } else {
    lines.unshift(greeting, "");
  }
  return lines.join("\n");
}

function buildPrompt(host, companyName, profile, siteText, channels) {
  return `You are a careful sales research assistant and an honest copywriter.

The user sells: ${profile.summary}
The user wants to reach (their BUYERS): ${profile.target || "businesses that need this service"}
${profile.edge ? "What could make the user stand out: " + profile.edge : ""}

Below is text from the website of a possible prospect (${host}). Use ONLY this text for facts about the prospect. Never invent facts. If you are inferring something, use words like "possibly" or "may". Do not put contact details in your analysis.

${siteText}

Step 1. Decide how this company relates to the user.
IMPORTANT: the user wants to reach businesses of this type: ${profile.target || "businesses that need this service"}. Those are the user's BUYERS. A company that matches that customer type is a PROSPECT, even if the services it offers sound similar to the customer type. Only compare the company with what the USER SELLS (the first line above), never with the customer type.
- "prospect": it matches the customer type the user wants to reach, or would clearly buy what the user sells, and it does NOT sell the same kind of product, tool or service as the user sells.
- "competitor": it sells the same kind of product, tool or service that THE USER sells, or is a direct alternative to it.
- "unrelated": no clear need for what the user sells, or it is a media site, data provider, directory, tool vendor in a different field, personal blog or large platform.
Example: if the user sells a sales tool for web developers, a web development studio is a prospect (a buyer), and another sales tool is a competitor.
Be strict, but do not label a buyer as a competitor.

Step 2. Judge the company's stage from the SIZE and maturity of the business, using the text only:
- "early": looks young (recently launched, beta, waitlist, early access, pre-seed or seed, founded within about the last 2 years, or very thin content).
- "growing": a small or mid-size business with real clients or traction. A solo freelancer, a freelancer with a small team, or a small agency (roughly under 25 people) belongs here no matter how many years they have been working.
- "established": a large, well-known or well-funded company (big team, enterprise customers, many products, funding rounds, offices in several countries).
Years of experience or a long portfolio do NOT make a small business established. If unsure, use "growing".

Step 3. Decision makers. From the text only, list people who are NAMED together with a job title and who could decide on buying what the user sells: owners, founders, CEO, managing directors, and heads, directors or managers of marketing, sales, growth, business development, partnerships or operations. Copy each name exactly as written in the text. Never invent a name or a title. At most 4, most relevant first: prefer the most senior person in marketing or sales, then the founder or owner. If the text names nobody, return an empty list.

Step 4. Only if the relationship is "prospect", write outreach drafts for these channels: ${channels.join(", ")}. If it is not a prospect, return "drafts": {}.
Rules for drafts: natural and human, no hype, no flattery, no fake claims. Mention one specific, real detail from their site. Never say you used their product or saw anything not in the text above. Do not invent facts about the user beyond what is stated above. Start the email with "Hi <first name of the first person in your list>," if you listed anyone, otherwise "Hi ${companyName} team,". Sign off with [Your name]. End with one low-pressure question.
Length limits: email under 110 words; x under 270 characters; linkedin under 70 words; instagram, tiktok, facebook and youtube under 45 words.

Return ONLY valid JSON in exactly this shape (email is an object, every other channel is a string):
{
  "relationship": "prospect, competitor or unrelated",
  "stage": "early, growing or established",
  "stage_evidence": "a short phrase from the text that supports the stage, or 'unclear'",
  "people": [ { "name": "Jane Doe", "title": "Head of Marketing" } ],
  "company_summary": "1-2 sentences on what this company does, only from the text",
  "fit_score": 0-100,
  "fit_reason": "1-2 sentences on why they might need the user's service",
  "evidence": "a short paraphrase of something on their site that supports this, or 'none found'",
  "confidence": "low, medium or high",
  "drafts": {
    "email": { "subject": "short subject", "body": "the email" }
  }
}`;
}

const TEAM_HREF = /\/(team|people|leadership|our-team|meet-the-team|management|founders)(\/|$|\?)/i;
const TEAM_LABEL = /^(team|our team|people|leadership|meet the team|founders|management)$/i;

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
    edge: String(body.profile?.edge || "").slice(0, 500),
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
  if (home.body.length < 150 && home.desc.length < 40) {
    return Response.json(
      { error: "This site loads its content in a way we cannot read." },
      { status: 422 }
    );
  }

  const emails = [];
  const socials = {};
  const pages = [{ url: url.toString(), html: homeHtml, body: home.body }];
  findEmails(homeHtml, url.toString(), emails);
  collectSocials(homeHtml, url.toString(), socials);

  const contactPage = findPage(homeHtml, url.toString(), /contact/i, /contact/i);
  const aboutPage = findPage(
    homeHtml,
    url.toString(),
    /\/(about|company|our-story|who-we-are)(\/|$|\?)/i,
    /^(about|about us|company|our story)$/i
  );
  const teamPage = findPage(homeHtml, url.toString(), TEAM_HREF, TEAM_LABEL);

  const wanted = [];
  for (const [label, pageUrl] of [
    ["contact", contactPage],
    ["about", aboutPage],
    ["team", teamPage],
  ]) {
    if (!pageUrl || pageUrl === url.toString()) continue;
    if (wanted.some((w) => w.url === pageUrl)) continue;
    wanted.push({ label, url: pageUrl });
  }
  const fetched = await Promise.all(
    wanted.map(async (w) => ({ ...w, html: await getHtml(w.url) }))
  );

  let contactText = "";
  let peopleText = "";
  for (const f of fetched) {
    if (!f.html) continue;
    const bodyText = textFrom(f.html).body;
    pages.push({ url: f.url, html: f.html, body: bodyText });
    findEmails(f.html, f.url, emails);
    collectSocials(f.html, f.url, socials);
    if (f.label === "contact") contactText = bodyText.slice(0, 1500);
    else peopleText += " " + bodyText.slice(0, 2500);
  }

  const hostName = url.hostname.replace(/^www\./, "");
  const companyName = displayName(home.title, hostName.split(".")[0]);

  const channels = ["email", ...Object.keys(socials)];
  const siteText = `Title: ${home.title}\nDescription: ${home.desc}\nPage text: ${home.body.slice(0, 4500)}\nContact page text: ${contactText}\nAbout and team pages text: ${peopleText.trim().slice(0, 4000)}`;
  const answer = await askAI(buildPrompt(url.hostname, companyName, profile, siteText, channels));
  if (answer.error) {
    return Response.json({ error: answer.error }, { status: 502 });
  }

  const r = answer.result || {};
  const people = verifyPeople(r.people, pages, emails);
  const firstName = people.length ? people[0].name.split(" ")[0] : "";

  const rawDrafts = r.drafts || {};
  const drafts = {};
  if (rawDrafts.email && typeof rawDrafts.email === "object") {
    drafts.email = {
      subject: String(rawDrafts.email.subject || "").slice(0, 200),
      body: fixGreeting(String(rawDrafts.email.body || "").slice(0, 2000), companyName, firstName),
    };
  }
  for (const key of Object.keys(socials)) {
    if (typeof rawDrafts[key] === "string") {
      drafts[key] = rawDrafts[key].slice(0, 1200);
    }
  }

  const orderedEmails = [...emails];
  for (const p of people) {
    if (!p.email) continue;
    const idx = orderedEmails.findIndex((e) => e.email === p.email);
    if (idx > 0) orderedEmails.unshift(orderedEmails.splice(idx, 1)[0]);
    break;
  }

  const stage = ["early", "growing", "established"].includes(r.stage) ? r.stage : "growing";
  const relationship = ["prospect", "competitor", "unrelated"].includes(r.relationship)
    ? r.relationship
    : "unrelated";

  return Response.json({
    site: url.hostname,
    url: url.toString(),
    relationship,
    stage,
    stage_evidence: String(r.stage_evidence || "unclear").slice(0, 200),
    company_summary: r.company_summary || "",
    fit_score: Math.max(0, Math.min(100, Number(r.fit_score) || 0)),
    fit_reason: r.fit_reason || "",
    evidence: r.evidence || "none found",
    confidence: r.confidence || "low",
    people,
    emails: orderedEmails.slice(0, 4),
    socials,
    contact_page: contactPage,
    drafts,
  });
      }
