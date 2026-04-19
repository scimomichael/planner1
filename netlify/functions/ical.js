// Fetches and parses an iCal (.ics) feed. Used by the client to import
// events from any calendar that exposes an .ics URL — Google Calendar
// "secret address in iCal format", Apple Calendar shared calendars,
// Outlook 365 published calendars, school portals, etc.
//
// Runs server-side so we bypass CORS restrictions that block direct
// browser fetches of most calendar URLs.
//
// POST body: { url: "https://...ical..." }
// Response:  { events: [{ uid, summary, description, location, start, end, allDay }], count }

const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Unfold iCal lines. Per RFC 5545, long lines are folded by inserting
// CRLF followed by a single whitespace char; we reverse that before parsing.
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

// Unescape iCal text: \n → newline, \, → comma, \; → semicolon, \\ → \
function unescapeICal(s) {
  return String(s || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse an iCal DATE or DATE-TIME value into a JS Date.
//   20260417            -> all-day  (treat as local midnight)
//   20260417T143000     -> floating local time
//   20260417T143000Z    -> UTC
function parseICalDateTime(val) {
  if (!val) return null;
  const s = val.trim();
  // Date-only (YYYYMMDD)
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6)) - 1;
    const d = Number(s.slice(6, 8));
    return { date: new Date(y, m, d), allDay: true };
  }
  // Date-time
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, Y, Mo, D, H2, Mi, S, z] = m;
  if (z === "Z") {
    return { date: new Date(Date.UTC(+Y, +Mo - 1, +D, +H2, +Mi, +S)), allDay: false };
  }
  return { date: new Date(+Y, +Mo - 1, +D, +H2, +Mi, +S), allDay: false };
}

// Walk the unfolded iCal body and extract VEVENT records.
function parseICal(text) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT")   { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    // key (with optional ;PARAMS) : value
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [key] = left.split(";");
    const keyUpper = key.toUpperCase();
    switch (keyUpper) {
      case "UID":         cur.uid = value; break;
      case "SUMMARY":     cur.summary = unescapeICal(value); break;
      case "DESCRIPTION": cur.description = unescapeICal(value); break;
      case "LOCATION":    cur.location = unescapeICal(value); break;
      case "DTSTART":     cur._start = parseICalDateTime(value); break;
      case "DTEND":       cur._end   = parseICalDateTime(value); break;
      case "RRULE":       cur.rrule  = value; break;
      case "STATUS":      cur.status = value; break;
    }
  }
  // Shape into plain serializable events
  return events.map(e => {
    const s = e._start;
    const en = e._end;
    return {
      uid: e.uid || null,
      summary: e.summary || "",
      description: e.description || "",
      location: e.location || "",
      start: s ? s.date.toISOString() : null,
      end:   en ? en.date.toISOString() : null,
      allDay: !!(s && s.allDay),
      rrule: e.rrule || null,
      status: e.status || null,
    };
  }).filter(e => e.start); // discard malformed
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };
  }
  let url;
  try { url = JSON.parse(event.body || "{}").url; } catch { /* noop */ }
  if (!url || typeof url !== "string") {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Missing 'url' in body" }) };
  }
  // Normalize webcal:// → https://
  url = url.replace(/^webcal:\/\//i, "https://");
  if (!/^https?:\/\//i.test(url)) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "URL must be http(s) or webcal" }) };
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ScimoPlanner/1.0 (ical-import)" },
      redirect: "follow",
    });
    if (!res.ok) {
      return { statusCode: 502, headers: H, body: JSON.stringify({ error: `Calendar server returned ${res.status}` }) };
    }
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { statusCode: 422, headers: H, body: JSON.stringify({ error: "Response was not an iCalendar feed" }) };
    }
    const events = parseICal(text);
    return {
      statusCode: 200,
      headers: H,
      body: JSON.stringify({ events, count: events.length }),
    };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
