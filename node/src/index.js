// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// See AGENTS.md for the full build/run/layout contract.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";

const app = new Hono();

// --- Scheduled-jobs receiver -------------------------------------------------
// POST /_system/tick is where deploymill delivers scheduled "ticks". When your
// app declares schedules in .deploymill/project.json (e.g.
//   "schedules": [{ "name": "daily-digest", "cron": "0 8 * * *" }]
// ), deploymill registers the cron and, on a due minute, POSTs this endpoint
// with `Authorization: Bearer <DM_SCHEDULE_TICK_SECRET>` (an env var deploymill
// injects automatically) and a JSON body { job, scheduledTime }. Ticks are
// at-least-once, so handlers MUST be idempotent — "do the work for whoever is
// DUE", not "fire exactly once".
// See deploymill's deploymill://guides/schedules for the full contract.

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

app.post("/_system/tick", async (c) => {
  if (!tokenOk(c.req.header("authorization"))) return c.json({ error: "unauthorized" }, 401);
  const { job } = await c.req.json();
  const handler = handlers[job];
  if (!handler) return c.json({ error: "unknown_job", job }, 404);
  await handler();
  return c.json({ ok: true, job });
});

app.get("/", (c) =>
  c.html(
    `<!doctype html><title>{{PROJECT_NAME}}</title><h1>{{PROJECT_NAME}}</h1><p>Hono on Node, scaffolded by deploymill.</p>`
  )
);

// Health endpoint — deploymill's canonical "is this deploy good?" signal.
// deploy / rollback / get_app_health and auto-rollback all probe this path and
// treat 200 as the ONLY healthy response: anything else (a 500, a thrown error,
// a timeout) means the deploy is bad and an auto-rollback-armed app reverts.
// Put your REAL readiness checks here and return 200 only when they all pass —
// e.g. uncomment to fail the gate when the database is unreachable:
//
//   app.get("/healthz", async (c) => {
//     try {
//       await pool.query("SELECT 1");        // DB reachable + migrations ran?
//       return c.json({ ok: true });
//     } catch {
//       return c.json({ ok: false }, 503);   // not ready → deploy stays on the old image
//     }
//   });
app.get("/healthz", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port}`);
