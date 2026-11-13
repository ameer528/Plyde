const GEMINI = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

const GROQ_PREFERRED = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGemini(model, prompt, ms) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 0 };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(ms),
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return { status: res.status };
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = parseJson(text);
    return parsed ? { result: parsed } : { status: -1 };
  } catch {
    return { status: -2 };
  }
}

let groqModelCache = null;

async function groqModels(key) {
  if (groqModelCache) return groqModelCache;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      let chosen = GROQ_PREFERRED.filter((id) => ids.includes(id));
      if (!chosen.length) {
        chosen = ids.filter(
          (id) => /llama|gpt-oss|qwen/i.test(id) && !/whisper|guard|tts|vision/i.test(id)
        );
      }
      if (chosen.length) {
        groqModelCache = chosen.slice(0, 2);
        return groqModelCache;
      }
    }
  } catch {}
  return GROQ_PREFERRED.slice(0, 2);
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { status: 0 };
  const models = await groqModels(key);
  let last = 0;
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
        }),
      });
      last = res.status;
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || "";
      const parsed = parseJson(text);
      if (parsed) return { result: parsed };
      last = -1;
    } catch {
      last = -2;
    }
  }
  return { status: last };
}

export async function askAI(prompt) {
  const statuses = [];

  const first = await callGemini(GEMINI[0], prompt, 10000);
  if (first.result) return { result: first.result };
  statuses.push(first.status);

  const groq = await callGroq(prompt);
  if (groq.result) return { result: groq.result };
  statuses.push(groq.status);

  for (const model of GEMINI.slice(1)) {
    const r = await callGemini(model, prompt, 10000);
    if (r.result) return { result: r.result };
    statuses.push(r.status);
  }

  if (statuses.includes(429)) {
    return { error: "The free AI limit was reached. Please try again in a few minutes." };
  }
  return { error: "The AI could not answer right now. Please try again." };
      }
