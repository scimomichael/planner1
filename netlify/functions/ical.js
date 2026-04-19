// iCal feed proxy - fetches and parses iCal/ICS feeds server-side (CORS bypass)
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };

  try {
    const { url } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, headers: H, body: JSON.stringify({ error: "url required" }) };

    const res = await fetch(url, { headers: { "User-Agent": "Planner/1.0" } });
    if (!res.ok) return { statusCode: 502, headers: H, body: JSON.stringify({ error: `Fetch failed: ${res.status}` }) };

    const text = await res.text();
    const events = parseICS(text);

    return { statusCode: 200, headers: H, body: JSON.stringify({ events, count: events.length }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};

function parseICS(text) {
  const events = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const ev = {};
    const lines = unfold(block);
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      const val = rest.join(":");
      const baseKey = key.split(";")[0].trim();
      if (baseKey === "SUMMARY") ev.summary = val.trim();
      if (baseKey === "DESCRIPTION") ev.description = val.replace(/\\n/g, "\n").replace(/\\,/g, ",").trim();
      if (baseKey === "LOCATION") ev.location = val.replace(/\\,/g, ",").trim();
      if (baseKey === "UID") ev.uid = val.trim();
      if (baseKey === "DTSTART") {
        const dt = parseICDate(val.trim());
        if (dt) { ev.date = dt.date; ev.start = dt.time; }
      }
      if (baseKey === "DTEND") {
        const dt = parseICDate(val.trim());
        if (dt) { ev.end = dt.time; }
      }
    }
    if (ev.date && ev.start) events.push(ev);
  }
  return events;
}

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\r/g, "").split("\n").filter(l => l.trim());
}

function parseICDate(s) {
  // Formats: 20260420T140000Z, 20260420T140000, 20260420
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] ? `${m[4]}:${m[5]}` : "00:00";
  return { date, time };
}
