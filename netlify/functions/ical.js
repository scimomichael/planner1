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
    const { url, secret } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, headers: H, body: JSON.stringify({ error: "url required" }) };

    // Normalize webcal:// to https://
    let fetchUrl = url.trim();
    if (fetchUrl.startsWith("webcal://")) fetchUrl = "https://" + fetchUrl.slice(9);

    // Build headers. If a secret is provided, try Bearer auth by default.
    // Also pass the secret in X-Api-Key header for systems that use it.
    const reqHeaders = { "User-Agent": "Planner/1.0" };
    const trimmedSecret = (secret || "").trim();
    if (trimmedSecret) {
      // If the secret looks like "user:password", use Basic auth
      if (trimmedSecret.includes(":") && !trimmedSecret.startsWith("Bearer ") && trimmedSecret.length < 200) {
        reqHeaders["Authorization"] = "Basic " + Buffer.from(trimmedSecret).toString("base64");
      } else if (trimmedSecret.startsWith("Bearer ") || trimmedSecret.startsWith("Basic ")) {
        // Pre-formatted Authorization header value
        reqHeaders["Authorization"] = trimmedSecret;
      } else {
        // Default: Bearer token + X-Api-Key (covers most auth-protected .ics feeds)
        reqHeaders["Authorization"] = "Bearer " + trimmedSecret;
        reqHeaders["X-Api-Key"] = trimmedSecret;
      }
    }

    const res = await fetch(fetchUrl, { headers: reqHeaders });
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403
        ? "Authentication failed. Check that the secret key is correct, or for Google Calendar use the full private .ics URL instead of a separate secret."
        : `Fetch failed: ${res.status}`;
      return { statusCode: 502, headers: H, body: JSON.stringify({ error: hint }) };
    }

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
      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;
      const keyPart = line.slice(0, colonIdx);
      const val = line.slice(colonIdx + 1);
      const baseKey = keyPart.split(";")[0].trim();
      if (baseKey === "SUMMARY") ev.summary = val.trim();
      if (baseKey === "DESCRIPTION") ev.description = val.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
      if (baseKey === "LOCATION") ev.location = val.replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
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
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").replace(/\r/g, "").split("\n").filter(l => l.trim());
}

function parseICDate(s) {
  // Formats: 20260420T140000Z, 20260420T140000, 20260420
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] ? `${m[4]}:${m[5]}` : "00:00";
  return { date, time };
}
