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

async function readSite(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "PlydeBot/0.1 (website analysis)" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return null;
    const html = (await res.text()).slice(0, 300000);
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
    if (body.length < 200 && desc.length < 40) return null;
    return `Title: ${title}\nDescription: ${desc}\nPage text: ${body}`.slice(0, 7000);
  } catch {
    return null;
  }
}

function buildPrompt(label, sourceText) {
  return `You are a sales research assistant for freelancers and small agencies.
Below is information about the business "${label}". Use ONLY this information. Do not invent facts about the business. If something is unclear, say so.

${sourceText}

Return ONLY valid JSON in exactly this shape:
{
  "business_summary": "2 sentences on what this business sells",
  "segments": [
    {
      "name": "type of customer",
      "fit_score": 0-100,
      "reason": "1 sentence on why this customer type would need the service"
    }
  ],
  "sample_email": {
    "target_segment": "name of the top segment",
    "subject": "short subject line",
    "body": "a short, natural, human cold email under 110 words. Use [First name] and [Company] as placeholders. No hype, no fake claims, no pretending to have seen the recipient's website. End with one low-pressure question."
  }
}
Give 5 segments, sorted by fit_score from highest to lowest.`;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const description = String(body.description || "").trim().slice(0, 2000);
  const websiteInput = String(body.website || "").trim();
  const url = websiteInput ? cleanUrl(websiteInput) : null;

  if (websiteInput && !url && !description) {
    return Response.json(
      { error: "Please enter a valid website, like example.com" },
      { status: 400 }
    );
  }
  if (!websiteInput && !description) {
    return Response.json(
      { error: "Enter a website or describe what you sell." },
      { status: 400 }
    );
  }

  const siteText = url ? await readSite(url.toString()) : null;

  if (!siteText && !description) {
    return Response.json(
      {
        error:
          "We could not read that website. Describe what you sell below and we will use that instead.",
        needsDescription: true,
      },
      { status: 422 }
    );
  }

  let sourceText = "";
  if (siteText) sourceText += `Website text:\n${siteText}\n\n`;
  if (description) sourceText += `Description written by the owner:\n${description}`;

  const label = url ? url.hostname : "this business";
  const answer = await askAI(buildPrompt(label, sourceText));
  if (answer.error) {
    return Response.json({ error: answer.error }, { status: 502 });
  }
  return Response.json({ site: label, result: answer.result });
}
