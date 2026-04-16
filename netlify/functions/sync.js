// Cross-device sync for schedule data
// Stores a single JSON blob that all users see - you're the only user
const { getStore } = require("@netlify/blobs");

const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const KEY = "planner-data-v1";

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H };

  const action = event.queryStringParameters?.action;

  try {
    const store = getStore({ name: "planner", consistency: "strong" });

    if (event.httpMethod === "GET" && action === "pull") {
      const raw = await store.get(KEY);
      const data = raw ? JSON.parse(raw) : { schedule: {}, focus: {}, meta: {}, updatedAt: 0 };
      return { statusCode: 200, headers: H, body: JSON.stringify(data) };
    }

    if (event.httpMethod === "POST" && action === "push") {
      const incoming = JSON.parse(event.body || "{}");
      incoming.updatedAt = Date.now();
      await store.set(KEY, JSON.stringify(incoming));
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, updatedAt: incoming.updatedAt }) };
    }

    return { statusCode: 400, headers: H, body: JSON.stringify({ error: "Invalid action" }) };
  } catch (e) {
    // Return empty data gracefully if Blobs unavailable
    return {
      statusCode: 200,
      headers: H,
      body: JSON.stringify({ schedule: {}, focus: {}, meta: {}, updatedAt: 0, _err: e.message }),
    };
  }
};
