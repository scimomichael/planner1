// Cross-device sync via Netlify Blobs.
// This file follows Netlify's EXACT recommended pattern for Lambda-compatible
// functions, per the official @netlify/blobs npm docs (Nov 2025):
//
//   import { connectLambda, getStore } from '@netlify/blobs'
//   export const handler = async (event) => {
//     connectLambda(event)
//     const store = getStore('my-store')
//     ...
//   }
//
// Key points this implementation gets right that the old version did not:
//   1. connectLambda(event) is called FIRST on every request, not wrapped in
//      try/catch that swallows errors.
//   2. getStore() uses the simple string form, matching the docs exactly.
//   3. Errors bubble up as real 500 responses so the client can show a red
//      "sync failed" dot instead of silently pretending to succeed.

const { connectLambda, getStore } = require("@netlify/blobs");

const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const STORE_NAME = "planner";
const KEY = "planner-data-v1";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: H, body: "" };
  }

  const action = event.queryStringParameters && event.queryStringParameters.action;

  // Diagnostic endpoint — hit /api/sync?action=ping in a browser to see
  // exactly what the server sees. Useful for confirming Blobs is wired up.
  if (action === "ping") {
    const diag = {
      action: "ping",
      now: Date.now(),
      nodeVersion: process.version,
      hasConnectLambda: typeof connectLambda === "function",
      hasGetStore: typeof getStore === "function",
      hasNetlifyBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
      siteIdEnvSet: !!(process.env.NETLIFY_SITE_ID || process.env.SITE_ID),
    };
    try {
      connectLambda(event);
      const store = getStore(STORE_NAME);
      const testKey = "__ping_" + Date.now();
      await store.set(testKey, String(Date.now()));
      const val = await store.get(testKey);
      await store.delete(testKey);
      diag.storeOk = !!val;
      diag.message = "Blobs is working correctly.";
    } catch (e) {
      diag.storeOk = false;
      diag.storeError = e.message || String(e);
      diag.stack = (e.stack || "").split("\n").slice(0, 3).join(" | ");
    }
    return { statusCode: 200, headers: H, body: JSON.stringify(diag, null, 2) };
  }

  try {
    // THIS is the line that fixes sync: it must come before getStore()
    // in lambda-compat mode, exactly as the official docs show.
    connectLambda(event);
    const store = getStore(STORE_NAME);

    if (event.httpMethod === "GET" && action === "pull") {
      const raw = await store.get(KEY);
      const data = raw
        ? JSON.parse(raw)
        : { schedule: {}, focus: {}, meta: {}, updatedAt: 0 };
      return { statusCode: 200, headers: H, body: JSON.stringify(data) };
    }

    if (event.httpMethod === "POST" && action === "push") {
      const incoming = JSON.parse(event.body || "{}");
      incoming.updatedAt = Date.now();
      await store.set(KEY, JSON.stringify(incoming));
      return {
        statusCode: 200,
        headers: H,
        body: JSON.stringify({ ok: true, updatedAt: incoming.updatedAt }),
      };
    }

    return {
      statusCode: 400,
      headers: H,
      body: JSON.stringify({
        error: "Invalid action. Use ?action=pull (GET), ?action=push (POST), or ?action=ping.",
      }),
    };
  } catch (e) {
    // Return a real 500 so the client's sync dot turns red.
    return {
      statusCode: 500,
      headers: H,
      body: JSON.stringify({
        error: "sync_failed",
        message: e.message || String(e),
        hint: "Hit /api/sync?action=ping for diagnostics.",
      }),
    };
  }
};
