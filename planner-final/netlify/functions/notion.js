// Notion proxy — token stays server-side, never in the browser
const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID || "24df8257bb1581908084ec8bde52cf72";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function notion(path, method = "GET", body = null) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Notion ${r.status}: ${txt}`);
  }
  return r.json();
}

const mapItem = (p) => ({
  id: p.id,
  name: p.properties?.Name?.title?.[0]?.plain_text || "Untitled",
  status: p.properties?.Status?.status?.name || "Not started",
  due: p.properties?.["Due date"]?.date?.start || null,
  description: p.properties?.Description?.rich_text?.[0]?.plain_text || "",
  notionUrl: p.url,
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS };

  const action = event.queryStringParameters?.action;
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  try {

    // LIST: auto-imports Not started + In progress only.
    // Also fetches Done so the website can show a Done column.
    if (action === "list") {
      const [activeRes, doneRes] = await Promise.all([
        notion(`/databases/${DB_ID}/query`, "POST", {
          filter: {
            or: [
              { property: "Status", status: { equals: "Not started" } },
              { property: "Status", status: { equals: "In progress" } },
            ],
          },
          sorts: [{ property: "Due date", direction: "ascending" }],
          page_size: 100,
        }),
        notion(`/databases/${DB_ID}/query`, "POST", {
          filter: { property: "Status", status: { equals: "Done" } },
          sorts: [{ property: "Due date", direction: "descending" }],
          page_size: 50,
        }),
      ]);

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          items: (activeRes.results || []).map(mapItem),
          done:  (doneRes.results  || []).map(mapItem),
        }),
      };
    }

    // CREATE
    if (action === "create") {
      const props = {
        Name:   { title: [{ text: { content: body.name || "New task" } }] },
        Status: { status: { name: body.status || "Not started" } },
      };
      if (body.due)         props["Due date"]  = { date: { start: body.due } };
      if (body.description) props.Description  = { rich_text: [{ text: { content: body.description } }] };

      const page = await notion("/pages", "POST", {
        parent: { database_id: DB_ID },
        properties: props,
      });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ id: page.id, url: page.url }) };
    }

    // UPDATE
    if (action === "update") {
      const { id, ...fields } = body;
      if (!id) throw new Error("Missing id");

      const props = {};
      if (fields.name !== undefined)
        props.Name        = { title: [{ text: { content: fields.name } }] };
      if (fields.status)
        props.Status      = { status: { name: fields.status } };
      if ("due" in fields)
        props["Due date"] = fields.due ? { date: { start: fields.due } } : { date: null };
      if ("description" in fields)
        props.Description = { rich_text: fields.description ? [{ text: { content: fields.description } }] : [] };

      await notion(`/pages/${id}`, "PATCH", { properties: props });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // DELETE (archive)
    if (action === "delete") {
      if (!body.id) throw new Error("Missing id");
      await notion(`/pages/${body.id}`, "PATCH", { archived: true });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Unknown action" }) };

  } catch (e) {
    console.error("Notion proxy error:", e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
