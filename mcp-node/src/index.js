// {{PROJECT_NAME}} — a deploymill MCP server.
//
// THE entrypoint: the Dockerfile runs `node src/index.js`. Edit this file (or
// import into it) to change the server; see AGENTS.md for the build/run contract.
//
// Exposes tools (and optionally resources/prompts) to AI agents via the
// Model Context Protocol over HTTP. Clients connect to the /mcp endpoint
// using the Streamable HTTP transport (the current MCP standard).
//
// To connect Claude Desktop (or any MCP client) point it at:
//   https://<your-domain>/mcp
//
// Add your own tools below — each tool is a function the AI can call.
// See https://modelcontextprotocol.io/docs for the full spec.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const port = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Scheduled-jobs receiver.
//
// POST /_system/tick is where deploymill delivers scheduled "ticks". When your
// app declares schedules in .deploymill/project.json (e.g.
//   "schedules": [{ "name": "daily-digest", "cron": "0 8 * * *" }]
// ), deploymill registers the cron and, on a due minute, POSTs this endpoint
// with `Authorization: Bearer <DM_SCHEDULE_TICK_SECRET>` (an env var deploymill
// injects automatically) and a JSON body { job, scheduledTime }. Ticks are
// at-least-once, so handlers MUST be idempotent — "do the work for whoever is
// DUE", not "fire exactly once".
// See deploymill's deploymill://guides/schedules for the full contract.
// ---------------------------------------------------------------------------

const TICK_SECRET = process.env.DM_SCHEDULE_TICK_SECRET ?? "";

function tokenOk(header) {
  if (!TICK_SECRET || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(TICK_SECRET);
  // Length guard is required: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

// Register your scheduled handlers here, keyed by the schedule `name` from
// .deploymill/project.json. Handlers MUST be idempotent (a tick can fire more
// than once). An app with no schedules is never ticked; an unknown job returns
// 404 — that's the "you declared a schedule but didn't add its handler" signal.
const handlers = {
  // "daily-digest": async () => { /* ... */ },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function handleTick(req, res) {
  if (!tokenOk(req.headers["authorization"])) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const { job } = JSON.parse((await readBody(req)) || "{}");
  const handler = handlers[job];
  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unknown_job", job }));
    return;
  }
  await handler();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, job }));
}

// ---------------------------------------------------------------------------
// Tool definitions — add your own here.
// ---------------------------------------------------------------------------

function buildMcpServer() {
  const mcp = new McpServer({ name: "{{PROJECT_NAME}}", version: "0.1.0" });

  // Example tool — replace or extend with your own.
  mcp.tool(
    "hello",
    "Return a personalised greeting.",
    { name: z.string().describe("The name to greet") },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}!` }],
    })
  );

  return mcp;
}

// ---------------------------------------------------------------------------
// HTTP server — one transport per request (stateless, horizontally scalable).
//
// For session-aware servers (streaming resources, subscriptions) replace
// sessionIdGenerator with a real ID factory and keep a server-side session
// map so the same McpServer instance handles all requests in a session.
// ---------------------------------------------------------------------------

const httpServer = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;

  // Health endpoint — deploymill probes this after every deploy.
  if (path === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (path === "/_system/tick" && req.method === "POST") {
    await handleTick(req, res);
    return;
  }

  if (path === "/mcp") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    const mcp = buildMcpServer();
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

httpServer.listen(port, () =>
  console.log(`[{{PROJECT_NAME}}] MCP server listening on :${port} — endpoint: /mcp`)
);

process.on("SIGTERM", () => {
  console.log("[{{PROJECT_NAME}}] received SIGTERM, shutting down");
  httpServer.close(() => process.exit(0));
});
