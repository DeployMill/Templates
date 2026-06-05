import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

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
