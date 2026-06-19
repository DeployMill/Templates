// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// The SQLite wiring lives in src/db.js. See AGENTS.md for the full contract.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { db, persistent } from "./db.js";

// Schema + seed run at boot. CREATE TABLE IF NOT EXISTS is idempotent, so this
// is safe to re-run on every start (it doubles as a trivial migration).
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL DEFAULT 0
  );
`);
db.exec(`INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0);`);

const bump = db.prepare(`UPDATE visits SET count = count + 1 WHERE id = 1;`);
const read = db.prepare(`SELECT count FROM visits WHERE id = 1;`);

const app = new Hono();

app.get("/", (c) => {
  // A persistent counter: increment on every load. If sqlite is provisioned the
  // number keeps climbing across restarts and redeploys; on the in-memory
  // fallback it resets to 1 each time the container restarts.
  bump.run();
  const { count } = read.get();
  const mode = persistent
    ? "persistent (file: DATABASE_URL on a deploymill volume)"
    : "EPHEMERAL in-memory fallback — provision sqlite to persist";
  return c.html(
    `<!doctype html><title>{{PROJECT_NAME}}</title>
     <h1>{{PROJECT_NAME}}</h1>
     <p>Visits: <strong>${count}</strong></p>
     <p>SQLite storage: ${mode}.</p>
     <p>node:sqlite on Node 24, scaffolded by deploymill.</p>
     <!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge-->`
  );
});

// Health endpoint — deploymill's canonical "is this deploy good?" signal.
// deploy / rollback / get_app_health and auto-rollback all probe this path and
// treat 200 as the ONLY healthy response. Here we prove the database is actually
// reachable, so a broken DB wiring fails the gate instead of shipping.
app.get("/healthz", (c) => {
  try {
    db.prepare("SELECT 1;").get();
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 503);
  }
});

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

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (sqlite ${persistent ? "persistent" : "in-memory"})`);
