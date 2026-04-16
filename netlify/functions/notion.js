// NOTION PROXY — READ ONLY
// This function can only READ from Notion.
// It cannot write, update, delete, or archive anything.
// Status changes made on the website stay local only.

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID || "24df8257bb1581908084ec8bde52cf72";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function notionQuery(body) {
  const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${await r.text()}`);
  return r.json();
}

const map = (p) => ({
  id: p.id,
  name: p.properties?.Name?.title?.[0]?.plain_text || "Untitled",
  status: p.properties?.Status?.status?.name || "Not started",
  due: p.properties?.["Due date"]?.date?.start || null,
  description: p.properties?.Description?.rich_text?.[0]?.plain_text || "",
  url: p.url,
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS };
  if (event.queryStringParameters?.action !== "list") {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Read only. Only list action supported." }) };
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const dateFilter = {
      or: [
        { property: "Due date", date: { is_empty: true } },
        { property: "Due date", date: { on_or_after: cutoffStr } },
      ],
    };

    const [active, done] = await Promise.all([
      notionQuery({
        filter: {
          and: [
            { or: [
              { property: "Status", status: { equals: "Not started" } },
              { property: "Status", status: { equals: "In progress" } },
            ]},
            dateFilter,
          ],
        },
        sorts: [{ property: "Due date", direction: "ascending" }],
        page_size: 100,
      }),
      notionQuery({
        filter: {
          and: [
            { property: "Status", status: { equals: "Done" } },
            { or: [
              { property: "Due date", date: { is_empty: true } },
              { property: "Due date", date: { on_or_after: (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0,10); })() } },
            ]},
          ],
        },
        sorts: [{ property: "Due date", direction: "descending" }],
        page_size: 50,
      }),
    ]);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        active: (active.results || []).map(map),
        done: (done.results || []).map(map),
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
