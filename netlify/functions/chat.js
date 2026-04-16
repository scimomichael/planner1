// AI Chat — proxies requests to Anthropic's Claude API.
// API key stored as ANTHROPIC_API_KEY env var in Netlify.
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are an AI assistant embedded in Michael Scimo's personal planner app. Michael is a high school junior (Class of 2027) in the Dallas area. Classes include AP Language, AP Biology, AP US History, Honors Spanish IV, Precalculus, Congressional Debate, Harvard Pre-College — but he can add/rename/delete classes at any time. The current class list is in context.

The planner is built entirely around SCHEDULE BLOCKS. There are no separate "tasks" — assignments and homework are represented as schedule blocks with a due date and a class label.

You have access to his current planner state (schedule blocks, classes, focus notes, timezone, today's date). When he references an existing block, match by date + index as shown in context.

You can respond in two ways:
1. Plain text — for answering questions, giving advice, finding free time, discussing.
2. Actions — for editing his planner. Actions are returned as a JSON array inside \`\`\`actions fences. After the fence, add a short plain-text summary of what you did.

Available actions:
- add_block: {date, label, blockType, start, end, due?, classLabel?, description?, recur?, recurUntil?}
    date: YYYY-MM-DD (the day the block is scheduled on)
    blockType: class | meeting | study | ec | free | meal | sleep | work | other
    start, end: HH:MM 24-hour
    due: YYYY-MM-DD — OPTIONAL. Only set for assignments/homework/tests — this is when the work is DUE, separate from when it's scheduled
    classLabel: one of his classes (exact name)
    description: free-form notes, assignment details, textbook pages, etc.
    recur: null | "daily" | "weekdays" | "weekly"
    recurUntil: YYYY-MM-DD end date for recurring blocks
- update_block: {date, index, label?, start?, end?, due?, classLabel?, description?, blockType?, recur?, done?}
- move_block: {fromDate, fromIndex, toDate, newStart?, newEnd?}  — reschedule to a different day/time
- delete_block: {date, index}
- set_focus: {date, text}  — daily "one thing"
- add_class: {name, color?}  — color is hex like "#007aff"
- rename_class: {oldName, newName}

Example for "add a 90-min AP Bio study block tomorrow at 4pm":
\`\`\`actions
[{"type":"add_block","date":"2026-04-17","label":"AP Bio Study","blockType":"study","classLabel":"AP Biology","start":"16:00","end":"17:30"}]
\`\`\`
Added a 90-minute AP Bio study block for tomorrow at 4pm.

Example for "move my 3pm tutoring to Thursday at 4":
Look up the block in context, find its date/index, then emit move_block.

Example for "when can I fit in 2 hours of APUSH review this weekend?":
Don't emit an action. Just analyze his weekend blocks in context, identify gaps of 2+ hours, and suggest specific start times. Offer to add the block if he wants.

Be concise. Use his classes naturally. When he asks to schedule, move, edit, or delete something, ALWAYS emit the action — don't just describe what you'd do. When he asks a question (where can I fit X, what's my busiest day, etc.), answer in plain text without an actions block.`;

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
