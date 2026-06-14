// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// The SQLite wiring lives in src/db.js. See AGENTS.md for the full contract.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
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
     <p>node:sqlite on Node 24, scaffolded by deploymill.</p>`
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

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (sqlite ${persistent ? "persistent" : "in-memory"})`);
