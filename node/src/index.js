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

// Starter landing page. It's intentionally a single self-contained block so you
// can replace the whole thing in one edit when you build the real app — just
// keep (or re-add) the badge markers below if this org is on the free tier.
app.get("/", (c) =>
  c.html(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{PROJECT_NAME}}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
      font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b1220;
      background:radial-gradient(1100px 600px at 50% -10%,#eef2fb,#e5e9f4)}
    .card{width:100%;max-width:34rem;padding:40px;text-align:center;background:#fff;
      border:1px solid rgba(11,18,32,.08);border-radius:20px;box-shadow:0 18px 50px rgba(11,18,32,.10)}
    .spark{font-size:36px;line-height:1}
    h1{margin:16px 0 8px;font-size:27px;letter-spacing:-.02em}
    p{margin:0 auto;max-width:27rem;color:#475467}
    .hint{margin-top:20px;font-size:14px;color:#667085}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;
      background:#f1f4f9;padding:2px 6px;border-radius:6px;color:#1f2937}
  </style>
</head>
<body>
  <main class="card">
    <div class="spark">🚀</div>
    <h1>{{PROJECT_NAME}}</h1>
    <p>It's live. This Hono-on-Node starter was scaffolded by deploymill and is ready to become your app.</p>
    <p class="hint">Edit <code>src/index.js</code> to replace this page — see <code>AGENTS.md</code> for the build &amp; deploy contract.</p>
  </main>
  <!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge-->
</body>
</html>`
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
