const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

const PROMPT = `You are a sales research assistant. The business sells web design to local restaurants.
Return ONLY valid JSON in exactly this shape:
{
  "business_summary": "2 sentences on what this business sells",
  "segments": [
    { "name": "type of customer", "fit_score": 0-100, "reason": "1 sentence" }
  ],
  "sample_email": { "subject": "short subject", "body": "a cold email under 110 words" }
}
Give 5 segments.`;

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ problem: "GEMINI_API_KEY is missing on the server" });
  }
  const report = [];
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(25000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parses = false;
      try {
        JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        parses = true;
      } catch {}
      report.push({
        model,
        status: res.status,
        ms: Date.now() - started,
        parses,
        error: data?.error?.message ? String(data.error.message).slice(0, 200) : null,
        finish: data?.candidates?.[0]?.finishReason || null,
        sample: text.slice(0, 150),
      });
    } catch (e) {
      report.push({
        model,
        status: "failed",
        ms: Date.now() - started,
        error: String(e && e.name ? e.name : e),
      });
    }
  }
  return Response.json(report);
                  }
