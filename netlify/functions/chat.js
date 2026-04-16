// AI Chat — proxies requests to Anthropic's Claude API.
// API key stored as ANTHROPIC_API_KEY env var in Netlify.
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are an AI assistant embedded in Michael Scimo's personal planner app. Michael is a high school junior (Class of 2027) in the Dallas area. Classes: AP Language, AP Biology, AP US History, Honors Spanish IV, Precalculus, Congressional Debate, Harvard Pre-College.

You have access to his current planner state (schedule blocks, tasks, focus notes) — this is provided in each message as context.

You can respond in two ways:
1. Plain text — for answering questions, giving advice, discussing.
2. Actions — for editing his planner. Actions are returned as a JSON array inside \`\`\`actions fences. After actions, add a plain-text summary.

Available actions:
- add_task: {name, category, classLabel, priority, due, status, est, notes}  (category: hw/test/ec/per, priority: low/medium/high, status: "Not started"/"In progress"/"Done")
- update_task: {id, ...fields to change}
- delete_task: {id}
- add_block: {date, label, type, start, end, due}  (date: YYYY-MM-DD, type: class/meeting/study/ec/free/meal/sleep/work/other, start/end: HH:MM 24-hr)
- update_block: {date, index, ...fields}
- delete_block: {date, index}
- set_focus: {date, text}  (date: YYYY-MM-DD)

Example response with actions:
\`\`\`actions
[
  {"type":"add_block","date":"2026-04-17","label":"AP Bio Study","type":"study","start":"16:00","end":"17:30"}
]
\`\`\`
I've added a 90-minute AP Bio study block for tomorrow at 4pm.

Be concise. Use his classes naturally. Today's date and his timezone are provided. When he asks to schedule things, ALWAYS create the action — don't just suggest.`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: H,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify env vars. Go to Site settings → Environment variables." })
    };
  }

  try {
    const { messages, context } = JSON.parse(event.body || "{}");
    if (!Array.isArray(messages) || !messages.length) {
      return { statusCode: 400, headers: H, body: JSON.stringify({ error: "messages required" }) };
    }

    // Build the system prompt with current planner state as context
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tz = context?.timezone || "America/Chicago";

    const contextBlock = `
Current date: ${todayStr} (${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })})
Timezone: ${tz}

Current planner state:
${JSON.stringify(context || {}, null, 2)}
`;

    const fullSystem = SYSTEM_PROMPT + "\n\n" + contextBlock;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: fullSystem,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return { statusCode: apiRes.status, headers: H, body: JSON.stringify({ error: `Claude API: ${err}` }) };
    }

    const data = await apiRes.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");

    // Parse actions from response if present
    let actions = [];
    let cleanText = text;
    const actionMatch = text.match(/```actions\s*([\s\S]*?)```/);
    if (actionMatch) {
      try {
        actions = JSON.parse(actionMatch[1].trim());
      } catch (e) {
        actions = [];
      }
      cleanText = text.replace(/```actions[\s\S]*?```/g, "").trim();
    }

    return {
      statusCode: 200,
      headers: H,
      body: JSON.stringify({ text: cleanText, actions, raw: text }),
    };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
