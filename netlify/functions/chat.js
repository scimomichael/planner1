const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Compute the user's current wall-clock date (YYYY-MM-DD) in their tz.
// Netlify Functions run in UTC so we MUST convert explicitly, otherwise the
// AI gets told "today is April 20" when it's still 8 PM on the 19th in Dallas.
function todayInZone(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const o = {};
  for (const p of parts) if (p.type !== "literal") o[p.type] = p.value;
  // Day of week -> 0..6 (Sun..Sat)
  const WD = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const dow = WD[o.weekday] ?? 0;
  const hh = o.hour === "24" ? "00" : o.hour;
  return {
    date: `${o.year}-${o.month}-${o.day}`,         // 2026-04-19
    weekday: o.weekday,                             // Sunday
    dow,                                            // 0..6
    wallTime: `${hh}:${o.minute}`,                  // 15:42
    pretty: `${o.weekday}, ${monthName(+o.month)} ${+o.day}, ${o.year}`, // Sunday, April 19, 2026
  };
}

function monthName(m) {
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1];
}

// Add N days to a YYYY-MM-DD date string and return a new YYYY-MM-DD.
// Uses UTC math to avoid DST shifting the result.
function addDaysStr(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Build a map of relative-day aliases → YYYY-MM-DD so the AI never has to do
// date arithmetic and can never land on the wrong day.
function buildDateMap(today) {
  const WD = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const m = {};
  m["today"] = today.date;
  m["tomorrow"] = addDaysStr(today.date, 1);
  m["day after tomorrow"] = addDaysStr(today.date, 2);
  m["yesterday"] = addDaysStr(today.date, -1);
  // Next 14 days by weekday name
  for (let i = 1; i <= 14; i++) {
    const ymd = addDaysStr(today.date, i);
    const dow = (today.dow + i) % 7;
    const label = WD[dow].toLowerCase();
    // Only store first occurrence; "this Monday" = nearest upcoming Monday
    if (!m[`this ${label}`]) m[`this ${label}`] = ymd;
    if (!m[`next ${label}`] && i >= 7) m[`next ${label}`] = ymd;
    if (!m[label]) m[label] = ymd; // bare weekday = nearest upcoming
  }
  return m;
}

const SYSTEM_PROMPT = `You are an AI assistant embedded in Michael Scimo's personal planner app. Michael is a high school junior (Class of 2027) in the Dallas area. Classes include AP Language, AP Biology, AP US History, Honors Spanish IV, Precalculus, Congressional Debate.

The planner is built entirely around SCHEDULE BLOCKS. Homework and assignments are schedule blocks with a due date and a class label.

## Date handling (critical)

The context includes both "today" (YYYY-MM-DD) and a "date_map" that resolves common phrases like "tomorrow", "friday", "next monday" to exact YYYY-MM-DD dates. ALWAYS use date_map to resolve relative dates. NEVER compute dates yourself. Every action date MUST be a YYYY-MM-DD string.

## Block types (required)

Every add_block and bulk_add_blocks action MUST include a blockType, chosen from this exact list:

- class - attending a class
- exam - test, quiz, final, midterm
- meeting - appointment, call, office hours, 1:1
- study - homework, studying, reading, problem sets, assignments
- ec - extracurricular (debate practice, club, tournament, volunteering)
- free - break, flex time
- meal - breakfast, lunch, dinner, snack
- sleep - sleep or nap
- work - job, paid work, internship
- other - only if none above fit

Pick the type yourself from context ("dinner" -> meal, "study APUSH" -> study, "debate" -> ec, "take a nap" -> sleep). If ambiguous, ASK in plain text; do not emit an action with a guessed type.

## How to respond

You MUST respond in ONE of two modes:

Mode A - Plain text: For questions, advice, finding free time, asking clarification. Just write plain English. No action fence.

Mode B - Action: For ANY create/edit/move/delete/duplicate/rename operation on his planner, you MUST emit a fenced action block followed by a short confirmation sentence.

The fenced block MUST look EXACTLY like this (three backticks, the word actions, newline, JSON array, three backticks):

\`\`\`actions
[{"type":"add_block","date":"2026-04-20","label":"AP Bio problem set","blockType":"study","start":"19:00","end":"20:00","classLabel":"AP Biology"}]
\`\`\`
Added a study block for AP Biology tonight from 7 to 8 PM.

CRITICAL: If the user asks you to add/move/edit anything, you MUST emit the actions fence. Do NOT describe what you would do. Do NOT write "I'll add..." without the fence. The fence is the ONLY way the app actually changes the schedule. A reply without the fence when one is needed is a BUG.

## Available actions (exact schemas)

- add_block: {type:"add_block", date, label, blockType, start, end, due?, dueTime?, dueInClass?, classLabel?, description?, recur?, recurUntil?, priority?, location?, link?}
- update_block: {type:"update_block", date, index, label?, start?, end?, due?, dueTime?, dueInClass?, classLabel?, description?, blockType?, recur?, done?, priority?, location?, link?}
- move_block: {type:"move_block", fromDate, fromIndex, toDate, newStart?, newEnd?}
- duplicate_block: {type:"duplicate_block", date, index, toDate?, newStart?, newEnd?}
- delete_block: {type:"delete_block", date, index}
- bulk_add_blocks: {type:"bulk_add_blocks", blocks:[{date, label, blockType, start, end, ...}, ...]}
- add_class: {type:"add_class", name, color?}
- rename_class: {type:"rename_class", oldName, newName}

All times are 24-hour HH:MM in the user's local timezone. Use the index from context.schedule[date][i].index when referencing existing blocks.

## Change history (context.recentChanges)

The context includes a "recentChanges" field: an array of the last 60 changes made to the planner in the past 2 weeks. Each entry has: ts (ms), iso (human-readable timestamp), type, source, summary. Types include block_added, block_updated, block_deleted, block_completed, block_uncompleted, class_added, class_renamed, class_recolored, class_deleted, calendar_sync. Source is one of: manual (user via UI), ai (you, via an earlier conversation), calendar (auto-sync), quickadd, template, import.

Use recentChanges when the user asks:
- "What did I change yesterday?" / "Show me what I did this week" -> summarize from the list.
- "Where did that block go?" / "Did I move the AP Bio thing?" -> trace through block_updated and block_deleted entries.
- "Undo what you just did" -> look at the most recent entries with source=ai and describe or reverse them.
- "Did I already do X?" -> check recent block_added or block_completed entries.

Reference changes conversationally -- don't dump the raw list. Summarize in plain English with dates and times.

## Due-time semantics

Assignment blocks can have a due date AND optionally a due time. There are three states:

- No due time set: omit dueTime and dueInClass (or set both to empty/false)
- Due at a specific time: set dueTime to HH:MM (e.g. "23:59" for 11:59 PM, "14:30" for 2:30 PM), dueInClass=false
- Due in class (no specific clock time): set dueInClass=true, omit dueTime

If the user says "due at 11:59 PM" or "midnight" or "end of day", use dueTime="23:59".
If the user says "due in class" or "before class", use dueInClass=true.
Never set both dueTime and dueInClass.

## Worked examples

User: "add dinner at 7 tonight"
Response:
\`\`\`actions
[{"type":"add_block","date":"<today from date_map>","label":"Dinner","blockType":"meal","start":"19:00","end":"20:00"}]
\`\`\`
Added dinner tonight from 7 to 8.

User: "move my AP Bio study from tuesday to wednesday"
Response: (look up the block in context.schedule for tuesday's date, get its index)
\`\`\`actions
[{"type":"move_block","fromDate":"<tuesday>","fromIndex":<i>,"toDate":"<wednesday>"}]
\`\`\`
Moved the AP Bio study block to Wednesday.

User: "when do I have free time this week?"
Response (plain text, no fence): You have free time from ...

Be concise. Never guess at dates without using date_map. Always emit the actions fence for any planner change.`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify env vars." }) };

  try {
    const { messages, context } = JSON.parse(event.body || "{}");
    if (!Array.isArray(messages) || !messages.length) {
      return { statusCode: 400, headers: H, body: JSON.stringify({ error: "messages required" }) };
    }

    const tz = (context && context.timezone) || "America/Chicago";
    const today = todayInZone(tz);
    const dateMap = buildDateMap(today);

    const enrichedContext = {
      today: today.date,
      today_pretty: today.pretty,
      weekday: today.weekday,
      wall_time: today.wallTime,
      timezone: tz,
      date_map: dateMap,
      focus: context?.focus || {},
      schedule: context?.schedule || {},
      classes: context?.classes || [],
      blockTypes: context?.blockTypes || [],
    };

    const contextBlock = `
Today is ${today.pretty}.
Current local wall time: ${today.wallTime} ${tz}.

Use this planner state (existing blocks indexed per date):
${JSON.stringify(enrichedContext, null, 2)}
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
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    // Extract actions fence; be lenient about casing & whitespace.
    let actions = [];
    let cleanText = text;
    const actionMatch = text.match(/```\s*actions\s*\n([\s\S]*?)```/i);
    if (actionMatch) {
      const raw = actionMatch[1].trim();
      try {
        const parsed = JSON.parse(raw);
        actions = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Be forgiving: sometimes the model outputs a single object without brackets
        try { actions = [JSON.parse(raw)]; } catch {}
      }
      cleanText = text.replace(/```\s*actions[\s\S]*?```/gi, "").trim();
    }

    return {
      statusCode: 200,
      headers: H,
      body: JSON.stringify({ text: cleanText, actions, raw: text, today: today.date }),
    };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
