const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ problem: "GEMINI_API_KEY is missing on the server" });
  }
  const report = [];
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
          }),
        }
      );
      const data = await res.json();
      report.push({
        model,
        status: res.status,
        message: data?.error?.message
          ? String(data.error.message).slice(0, 250)
          : "works",
      });
    } catch (e) {
      report.push({ model, status: "network error" });
    }
  }
  return Response.json(report);
}
