// iCal feed proxy -- fetches and parses iCal/ICS feeds server-side.
// Handles three DTSTART/DTEND formats correctly:
//   1. DTSTART:20260420T140000Z                  -- UTC (Z suffix)
//   2. DTSTART;TZID=America/Chicago:20260420T140000  -- already in local tz
//   3. DTSTART;VALUE=DATE:20260420                -- floating all-day
// All times are output as local time in the client's target timezone
// (default America/Chicago), which matches how the planner displays blocks.

const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TZ = "America/Chicago";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: JSON.stringify({ error: "POST only" }) };

  try {
    const { url, secret, tz } = JSON.parse(event.body || "{}");
    if (!url) return { statusCode: 400, headers: H, body: JSON.stringify({ error: "url required" }) };

    const targetTz = (tz && typeof tz === "string") ? tz : DEFAULT_TZ;

    let fetchUrl = url.trim();
    if (fetchUrl.startsWith("webcal://")) fetchUrl = "https://" + fetchUrl.slice(9);

    const reqHeaders = { "User-Agent": "Planner/1.0" };
    const trimmedSecret = (secret || "").trim();
    if (trimmedSecret) {
      if (trimmedSecret.includes(":") && !trimmedSecret.startsWith("Bearer ") && trimmedSecret.length < 200) {
        reqHeaders["Authorization"] = "Basic " + Buffer.from(trimmedSecret).toString("base64");
      } else if (trimmedSecret.startsWith("Bearer ") || trimmedSecret.startsWith("Basic ")) {
        reqHeaders["Authorization"] = trimmedSecret;
      } else {
        reqHeaders["Authorization"] = "Bearer " + trimmedSecret;
        reqHeaders["X-Api-Key"] = trimmedSecret;
      }
    }

    const res = await fetch(fetchUrl, { headers: reqHeaders });
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403
        ? "Authentication failed. Check the secret key, or for Google Calendar use the full private .ics URL."
        : `Fetch failed: ${res.status}`;
      return { statusCode: 502, headers: H, body: JSON.stringify({ error: hint }) };
    }

    const text = await res.text();
    const events = parseICS(text, targetTz);

    return { statusCode: 200, headers: H, body: JSON.stringify({ events, count: events.length }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};

function parseICS(text, targetTz) {
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
      // Parse parameters like ;TZID=America/Chicago ;VALUE=DATE
      const params = {};
      keyPart.split(";").slice(1).forEach(p => {
        const eq = p.indexOf("=");
        if (eq > 0) params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).trim();
      });
      if (baseKey === "SUMMARY") ev.summary = unescapeICS(val.trim());
      else if (baseKey === "DESCRIPTION") ev.description = unescapeICS(val.trim());
      else if (baseKey === "LOCATION") ev.location = unescapeICS(val.trim());
      else if (baseKey === "UID") ev.uid = val.trim();
      else if (baseKey === "DTSTART") {
        const dt = parseICDate(val.trim(), params, targetTz);
        if (dt) { ev.date = dt.date; ev.start = dt.time; ev.allDay = dt.allDay; }
      }
      else if (baseKey === "DTEND") {
        const dt = parseICDate(val.trim(), params, targetTz);
        if (dt) {
          // For all-day DTEND, iCal uses exclusive end (the day after). We don't use end-date here;
          // we keep only the time. For timed events, ev.end holds the end time.
          ev.end = dt.time;
        }
      }
    }
    if (ev.date && ev.start) events.push(ev);
  }
  return events;
}

function unescapeICS(s) {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function unfold(text) {
  // RFC 5545: continuation lines begin with a space or tab
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter(l => l.trim());
}

// Parses an iCal DATE or DATE-TIME value and returns { date: "YYYY-MM-DD", time: "HH:MM", allDay: bool }
// in the TARGET timezone. This is the critical fix for the "times are ~6 hours off" bug.
function parseICDate(s, params, targetTz) {
  // Date-only (VALUE=DATE or 8 digits): floating all-day -- keep as-is
  const dateOnly = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: "00:00", allDay: true };
  }

  // Date-time: YYYYMMDDTHHMMSS (optional Z)
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;

  const [, yr, mo, da, hr, mi, se, z] = m;
  const isUtc = z === "Z";
  const srcTz = params.TZID;

  // Build a JS Date for the moment in time.
  // Case A: trailing Z -- treat as UTC.
  // Case B: explicit TZID -- interpret wall time in that zone.
  // Case C: no Z and no TZID -- iCal calls this "floating"; most feeds that do this
  //         mean "local time of the viewer," so we treat it as already in targetTz.
  let utcMs;
  if (isUtc) {
    utcMs = Date.UTC(+yr, +mo - 1, +da, +hr, +mi, +se);
  } else if (srcTz) {
    utcMs = wallTimeInZoneToUtcMs(+yr, +mo - 1, +da, +hr, +mi, +se, srcTz);
  } else {
    // Floating -- treat as targetTz local time. That is: no conversion needed,
    // just output the original fields.
    return { date: `${yr}-${mo}-${da}`, time: `${hr}:${mi}`, allDay: false };
  }

  // Convert that UTC instant to wall time in targetTz.
  return utcMsToZoneWall(utcMs, targetTz);
}

// Convert a wall-clock time interpreted in `zone` to a UTC millisecond timestamp.
// Uses Intl DateTimeFormat with a small search (DST is continuous so two passes suffice).
function wallTimeInZoneToUtcMs(y, mIdx, d, h, mi, s, zone) {
  // First guess: assume the wall time is UTC, then measure the zone's offset
  // at that instant, and correct.
  let utcGuess = Date.UTC(y, mIdx, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const wall = utcMsToZoneWall(utcGuess, zone);
    const [wy, wm, wd] = wall.date.split("-").map(Number);
    const [wh, wmi] = wall.time.split(":").map(Number);
    // Compute the delta between where we wanted to land and where we did.
    const wantedMs = Date.UTC(y, mIdx, d, h, mi, s);
    const landedMs = Date.UTC(wy, wm - 1, wd, wh, wmi, s);
    const delta = wantedMs - landedMs;
    if (delta === 0) break;
    utcGuess += delta;
  }
  return utcGuess;
}

// Given a UTC millisecond timestamp, return the wall-clock date/time in `zone`.
function utcMsToZoneWall(utcMs, zone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // hour "24" can appear on some engines when wall time is midnight; normalize.
  let hh = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hh}:${parts.minute}`,
    allDay: false,
  };
}
