// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// The Postgres wiring lives in src/db.js. See AGENTS.md for the full contract
// and the "make it yours" remix knobs.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html, raw } from "hono/html";
import { hasDatabase, query, withRetry } from "./db.js";

// --- Schema + seed -----------------------------------------------------------
// CREATE TABLE IF NOT EXISTS is idempotent, so this is safe to re-run on every
// boot (it doubles as a trivial migration). To add a field, add a column here
// (ALTER TABLE ... ADD COLUMN IF NOT EXISTS) and surface it in the routes below.
let dbReady = false;

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS columns (
      id       SERIAL PRIMARY KEY,
      name     TEXT NOT NULL,
      position INT  NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cards (
      id         SERIAL PRIMARY KEY,
      column_id  INT  NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT,
      label      TEXT,
      position   INT  NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Seed three columns + a few example cards on first boot only (when empty), so
  // the board isn't blank on first view. Re-running never duplicates the seed.
  const { rows } = await query(`SELECT count(*)::int AS n FROM columns;`);
  if (rows[0].n === 0) {
    const seedCols = ["To Do", "In Progress", "Done"];
    const ids = [];
    for (let i = 0; i < seedCols.length; i++) {
      const r = await query(
        `INSERT INTO columns (name, position) VALUES ($1, $2) RETURNING id;`,
        [seedCols[i], i]
      );
      ids.push(r.rows[0].id);
    }
    const seedCards = [
      [ids[0], "Welcome to your board 👋", "Edit or delete this card. Ask your agent to remix it.", "info"],
      [ids[0], "Drag me to another column", "Use the ◀ ▶ buttons to move between columns.", null],
      [ids[1], "Something in progress", null, "wip"],
      [ids[2], "A finished task", null, "done"],
    ];
    for (let i = 0; i < seedCards.length; i++) {
      const [colId, title, body, label] = seedCards[i];
      await query(
        `INSERT INTO cards (column_id, title, body, label, position) VALUES ($1, $2, $3, $4, $5);`,
        [colId, title, body, label, i]
      );
    }
  }
  dbReady = true;
  console.log("[db] schema ready");
}

// --- Views -------------------------------------------------------------------
const BOARD_TITLE = "{{PROJECT_NAME}}";

function layout(title, body) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { --bg:#f4f5f7; --lane:#ebecf0; --card:#fff; --ink:#172b4d; --accent:#0c66e4; }
    * { box-sizing: border-box; }
    body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--ink); }
    header { padding:16px 24px; background:var(--accent); color:#fff; }
    header h1 { margin:0; font-size:20px; }
    .board { display:flex; gap:16px; padding:24px; overflow-x:auto; align-items:flex-start; }
    .lane { background:var(--lane); border-radius:10px; min-width:280px; max-width:280px; padding:10px; }
    .lane h2 { font-size:13px; text-transform:uppercase; letter-spacing:.04em; margin:4px 6px 10px; color:#5e6c84; }
    .card { background:var(--card); border-radius:8px; padding:10px 12px; margin-bottom:8px; box-shadow:0 1px 1px rgba(9,30,66,.2); }
    .card .t { font-weight:600; }
    .card .b { color:#42526e; font-size:13px; margin-top:4px; white-space:pre-wrap; }
    .label { display:inline-block; font-size:11px; padding:2px 8px; border-radius:99px; background:#dfe1e6; color:#42526e; margin-top:6px; }
    .row { display:flex; gap:6px; margin-top:8px; }
    button, .btn { font:inherit; border:0; border-radius:6px; padding:6px 10px; cursor:pointer; background:#091e420f; color:var(--ink); }
    button.primary { background:var(--accent); color:#fff; }
    form.inline { display:inline; }
    .add { width:100%; margin-top:4px; }
    input, textarea, select { font:inherit; width:100%; padding:6px 8px; border:1px solid #c1c7d0; border-radius:6px; margin:3px 0; }
    details summary { cursor:pointer; color:var(--accent); font-size:13px; }
    .banner { margin:24px; padding:16px 20px; background:#fffae6; border:1px solid #ffe380; border-radius:8px; }
  </style>
</head>
<body>
  <header><h1>${title}</h1></header>
  ${body}
  <!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge-->
</body>
</html>`;
}

function cardView(card) {
  return html`<div class="card">
    <div class="t">${card.title}</div>
    ${card.body ? html`<div class="b">${card.body}</div>` : ""}
    ${card.label ? html`<span class="label">${card.label}</span>` : ""}
    <div class="row">
      <form class="inline" method="post" action="/cards/${card.id}/move"><input type="hidden" name="dir" value="-1" /><button title="Move left">◀</button></form>
      <form class="inline" method="post" action="/cards/${card.id}/move"><input type="hidden" name="dir" value="1" /><button title="Move right">▶</button></form>
      <form class="inline" method="post" action="/cards/${card.id}/delete"><button title="Delete">✕</button></form>
    </div>
  </div>`;
}

// --- App ---------------------------------------------------------------------
const app = new Hono();

// Liveness probe — deploymill's canonical "is this deploy good?" signal. Kept as
// pure liveness (200 as soon as the process is up) so a database still warming
// on first boot never fails the gate and rolls back a good build. It reports DB
// readiness in the body for visibility. Make it gate on the DB (return 503 when
// !dbReady) only once you're sure the DB is provisioned before every deploy.
app.get("/healthz", (c) => c.json({ ok: true, database: hasDatabase ? (dbReady ? "ready" : "starting") : "none" }));

app.get("/", async (c) => {
  if (!hasDatabase) {
    return c.html(
      layout(
        BOARD_TITLE,
        html`<div class="banner"><strong>No database provisioned yet.</strong>
        This board stores its columns and cards in managed Postgres. Ask your agent to
        add a database (<code>reconcile_project</code>) — or it's already wired if you
        launched from the template, in which case give it a moment and refresh.</div>`
      )
    );
  }
  if (!dbReady) {
    return c.html(layout(BOARD_TITLE, html`<div class="banner">Starting up — the database is warming. Refresh in a few seconds.</div>`));
  }
  const cols = (await query(`SELECT * FROM columns ORDER BY position, id;`)).rows;
  const cards = (await query(`SELECT * FROM cards ORDER BY position, id;`)).rows;
  const lanes = cols.map(
    (col) => html`<div class="lane">
      <h2>${col.name}</h2>
      ${raw(cards.filter((c) => c.column_id === col.id).map((c) => cardView(c).toString()).join(""))}
      <details>
        <summary>+ Add card</summary>
        <form method="post" action="/cards" class="add">
          <input type="hidden" name="column_id" value="${col.id}" />
          <input name="title" placeholder="Card title" required />
          <textarea name="body" placeholder="Notes (optional)" rows="2"></textarea>
          <input name="label" placeholder="Label (optional)" />
          <button class="primary" type="submit">Add</button>
        </form>
      </details>
    </div>`
  );
  const addColumn = html`<div class="lane">
    <form method="post" action="/columns" class="add">
      <input name="name" placeholder="New column name" required />
      <button type="submit">+ Add column</button>
    </form>
  </div>`;
  return c.html(layout(BOARD_TITLE, html`<div class="board">${raw(lanes.map((l) => l.toString()).join(""))}${addColumn}</div>`));
});

// Helper: next position within a column (or board, for columns).
async function nextPosition(table, where, params) {
  const r = await query(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table} ${where};`, params);
  return r.rows[0].p;
}

app.post("/cards", async (c) => {
  const f = await c.req.parseBody();
  const columnId = Number(f.column_id);
  const title = String(f.title ?? "").trim();
  if (!title || !Number.isInteger(columnId)) return c.redirect("/");
  const pos = await nextPosition("cards", "WHERE column_id = $1", [columnId]);
  await query(
    `INSERT INTO cards (column_id, title, body, label, position) VALUES ($1, $2, $3, $4, $5);`,
    [columnId, title, String(f.body ?? "") || null, String(f.label ?? "") || null, pos]
  );
  return c.redirect("/");
});

// Move a card one column left/right (the robust fallback for drag-and-drop).
app.post("/cards/:id/move", async (c) => {
  const id = Number(c.req.param("id"));
  const dir = Number((await c.req.parseBody()).dir) >= 0 ? 1 : -1;
  const cols = (await query(`SELECT id FROM columns ORDER BY position, id;`)).rows.map((r) => r.id);
  const card = (await query(`SELECT column_id FROM cards WHERE id = $1;`, [id])).rows[0];
  if (card) {
    const idx = cols.indexOf(card.column_id);
    const target = cols[Math.min(cols.length - 1, Math.max(0, idx + dir))];
    if (target != null && target !== card.column_id) {
      const pos = await nextPosition("cards", "WHERE column_id = $1", [target]);
      await query(`UPDATE cards SET column_id = $1, position = $2 WHERE id = $3;`, [target, pos, id]);
    }
  }
  return c.redirect("/");
});

app.post("/cards/:id/delete", async (c) => {
  await query(`DELETE FROM cards WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/");
});

app.post("/columns", async (c) => {
  const name = String((await c.req.parseBody()).name ?? "").trim();
  if (name) {
    const pos = await nextPosition("columns", "", []);
    await query(`INSERT INTO columns (name, position) VALUES ($1, $2);`, [name, pos]);
  }
  return c.redirect("/");
});

app.post("/columns/:id/delete", async (c) => {
  await query(`DELETE FROM columns WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/");
});

// --- Boot --------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (database ${hasDatabase ? "provisioned" : "not provisioned"})`);

// Initialize the schema in the background with retry; don't block listening, so
// /healthz answers immediately and the deploy health-gate passes during warmup.
if (hasDatabase) {
  withRetry(initSchema).catch((e) => console.error("[db] schema init failed after retries:", e.message));
}
