// Generate a single fresh affirmation per day via Claude Haiku.
// The client POSTs {history: [last 30 affirmations seen]} so we can
// explicitly tell the model not to repeat anything the user has seen recently.
// Returns {text: "..."} on success.
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You generate a single daily affirmation for a high school junior in the Dallas area. Rules:

1. Themes: student life, productivity, showing up, being enough, patience, discipline, progress, resilience, honest effort. Nothing political.
2. Voice: direct, understated, grounded. Not corny. Not saccharine. Not performative.
3. Tone: NEVER feminized. NO "queen", "slay", "yasss", "you go girl", "girlboss", "babe", "honey", "sweetie", "gorgeous". NO heart emojis. NO sparkles. NO exclamation inflation.
4. Length: mix freely. Sometimes 3-5 words. Sometimes one full sentence. Sometimes two connected sentences. Vary day to day.
5. No quotes, no attribution, no "remember that", no "today is the day" cliches.
6. No all-caps. Normal sentence case.
7. Output ONLY the affirmation text. No preamble, no explanation, no quotation marks wrapping it.
8. Never repeat anything from the HISTORY list (verbatim or near-verbatim in meaning and structure).
9. Never begin with the exact same first 2 words as any recent history entry.

Examples of good style:
"Showing up is half the work."
"Hard now, easy later."
"Effort compounds quietly. Today's session is part of a longer pattern you won't see for weeks."
"Boring consistency beats heroic effort."
"You're not behind. You're on your own clock."

Examples of BAD style (never do these):
"Yasss, go get it today!" (feminized, performative)
"You are a goddess." (feminized, wrong)
"Today is YOUR day to SHINE!" (all caps, exclamation, cliche)
"Remember, beautiful soul, that you are enough." (saccharine, "beautiful soul")
"As the saying goes..." (no attributions)

Output exactly one affirmation. That's the entire response.`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };

  try {
    const body = JSON.parse(event.body || "{}");
    const history = Array.isArray(body.history) ? body.history.slice(-30) : [];
    const historyBlock = history.length
      ? `HISTORY (recent affirmations -- do not repeat verbatim or in meaning):\n${history.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nGenerate a new one that is clearly different.`
      : "No history yet. Generate a fresh affirmation.";

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: historyBlock }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return { statusCode: apiRes.status, headers: H, body: JSON.stringify({ error: `Claude API: ${err}` }) };
    }

    const data = await apiRes.json();
    let text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    // Strip surrounding quotes if the model added any, strip any preamble-like patterns
    text = text.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").trim();
    if (!text) return { statusCode: 502, headers: H, body: JSON.stringify({ error: "empty" }) };

    return { statusCode: 200, headers: H, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
