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
// boot (it doubles as a trivial migration). To add a field (a tag, a priority),
// add a column here and surface it in the routes below.
let dbReady = false;

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS lists (
      id       SERIAL PRIMARY KEY,
      name     TEXT NOT NULL,
      position INT  NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         SERIAL PRIMARY KEY,
      list_id    INT  NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      notes      TEXT,
      due_date   DATE,
      done       BOOLEAN NOT NULL DEFAULT false,
      position   INT  NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Seed one default list + a couple example tasks on first boot only.
  const { rows } = await query(`SELECT count(*)::int AS n FROM lists;`);
  if (rows[0].n === 0) {
    const list = await query(
      `INSERT INTO lists (name, position) VALUES ($1, 0) RETURNING id;`,
      ["My Tasks"]
    );
    const listId = list.rows[0].id;
    const seed = [
      ["Welcome to your task list 👋", "Edit, complete, or delete me. Ask your agent to remix it.", null, false],
      ["Try adding a due date", null, todayPlus(2), false],
      ["A finished task", null, null, true],
    ];
    for (let i = 0; i < seed.length; i++) {
      const [title, notes, due, done] = seed[i];
      await query(
        `INSERT INTO tasks (list_id, title, notes, due_date, done, position) VALUES ($1, $2, $3, $4, $5, $6);`,
        [listId, title, notes, due, done, i]
      );
    }
  }
  dbReady = true;
  console.log("[db] schema ready");
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- Views -------------------------------------------------------------------
const APP_TITLE = "{{PROJECT_NAME}}";

function layout(title, body) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { --bg:#fafafa; --ink:#1f2937; --muted:#6b7280; --accent:#2563eb; --overdue:#dc2626; }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--ink); }
    header { padding:18px 24px; background:#fff; border-bottom:1px solid #e5e7eb; }
    header h1 { margin:0; font-size:20px; }
    main { max-width:680px; margin:0 auto; padding:24px; }
    .list { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 18px; margin-bottom:18px; }
    .list h2 { font-size:15px; margin:0 0 10px; }
    .task { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-top:1px solid #f3f4f6; }
    .task:first-of-type { border-top:0; }
    .task.done .title { text-decoration:line-through; color:var(--muted); }
    .title { font-weight:500; }
    .meta { font-size:13px; color:var(--muted); }
    .meta.overdue { color:var(--overdue); font-weight:600; }
    .grow { flex:1; }
    button, .btn { font:inherit; border:0; border-radius:8px; padding:6px 10px; cursor:pointer; background:#f3f4f6; color:var(--ink); }
    button.primary { background:var(--accent); color:#fff; }
    form.inline { display:inline; }
    input, textarea { font:inherit; width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; margin:3px 0; }
    .add { display:grid; gap:6px; margin-top:12px; }
    .row { display:flex; gap:8px; }
    .filters a { margin-right:10px; color:var(--accent); text-decoration:none; font-size:14px; }
    .banner { padding:16px 20px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; }
  </style>
</head>
<body>
  <header><h1>${title}</h1></header>
  <main>${body}</main>
</body>
</html>`;
}

function taskView(task) {
  const overdue = task.due_date && !task.done && new Date(task.due_date) < new Date(new Date().toISOString().slice(0, 10));
  return html`<div class="task ${task.done ? "done" : ""}">
    <form class="inline" method="post" action="/tasks/${task.id}/toggle">
      <button title="${task.done ? "Mark not done" : "Mark done"}">${task.done ? "☑" : "☐"}</button>
    </form>
    <div class="grow">
      <div class="title">${task.title}</div>
      ${task.notes ? html`<div class="meta">${task.notes}</div>` : ""}
      ${task.due_date ? html`<div class="meta ${overdue ? "overdue" : ""}">Due ${String(task.due_date).slice(0, 10)}${overdue ? " · overdue" : ""}</div>` : ""}
    </div>
    <form class="inline" method="post" action="/tasks/${task.id}/delete"><button title="Delete">✕</button></form>
  </div>`;
}

// --- App ---------------------------------------------------------------------
const app = new Hono();

// Liveness probe — see kanban template note. Pure liveness so a warming database
// on first boot never trips a false rollback.
app.get("/healthz", (c) => c.json({ ok: true, database: hasDatabase ? (dbReady ? "ready" : "starting") : "none" }));

app.get("/", async (c) => {
  if (!hasDatabase) {
    return c.html(
      layout(APP_TITLE, html`<div class="banner"><strong>No database provisioned yet.</strong>
      This list stores its tasks in managed Postgres. Ask your agent to add a database
      (<code>reconcile_project</code>) — or it's already wired if you launched from the
      template; give it a moment and refresh.</div>`)
    );
  }
  if (!dbReady) {
    return c.html(layout(APP_TITLE, html`<div class="banner">Starting up — the database is warming. Refresh in a few seconds.</div>`));
  }
  const filter = c.req.query("filter") ?? "all";
  const lists = (await query(`SELECT * FROM lists ORDER BY position, id;`)).rows;
  const allTasks = (await query(`SELECT * FROM tasks ORDER BY done, position, id;`)).rows;
  const today = new Date().toISOString().slice(0, 10);
  const match = (t) =>
    filter === "today" ? String(t.due_date ?? "").slice(0, 10) === today
    : filter === "overdue" ? t.due_date && !t.done && String(t.due_date).slice(0, 10) < today
    : true;
  const sections = lists.map((list) => {
    const tasks = allTasks.filter((t) => t.list_id === list.id && match(t));
    return html`<div class="list">
      <h2>${list.name}</h2>
      ${raw(tasks.map((t) => taskView(t).toString()).join("")) || html`<div class="meta">Nothing here.</div>`}
      <form class="add" method="post" action="/tasks">
        <input type="hidden" name="list_id" value="${list.id}" />
        <input name="title" placeholder="Add a task…" required />
        <div class="row">
          <input name="due_date" type="date" />
          <button class="primary" type="submit">Add</button>
        </div>
      </form>
    </div>`;
  });
  const filters = html`<div class="filters">
    <a href="/?filter=all">All</a><a href="/?filter=today">Today</a><a href="/?filter=overdue">Overdue</a>
  </div>`;
  const addList = html`<form class="add" method="post" action="/lists">
    <div class="row"><input name="name" placeholder="New list name" required /><button type="submit">+ List</button></div>
  </form>`;
  return c.html(layout(APP_TITLE, html`${filters}${raw(sections.map((s) => s.toString()).join(""))}${addList}`));
});

async function nextPosition(table, where, params) {
  const r = await query(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table} ${where};`, params);
  return r.rows[0].p;
}

app.post("/tasks", async (c) => {
  const f = await c.req.parseBody();
  const listId = Number(f.list_id);
  const title = String(f.title ?? "").trim();
  if (!title || !Number.isInteger(listId)) return c.redirect("/");
  const pos = await nextPosition("tasks", "WHERE list_id = $1", [listId]);
  await query(
    `INSERT INTO tasks (list_id, title, notes, due_date, position) VALUES ($1, $2, $3, $4, $5);`,
    [listId, title, String(f.notes ?? "") || null, String(f.due_date ?? "") || null, pos]
  );
  return c.redirect("/");
});

app.post("/tasks/:id/toggle", async (c) => {
  await query(`UPDATE tasks SET done = NOT done WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/");
});

app.post("/tasks/:id/delete", async (c) => {
  await query(`DELETE FROM tasks WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/");
});

app.post("/lists", async (c) => {
  const name = String((await c.req.parseBody()).name ?? "").trim();
  if (name) {
    const pos = await nextPosition("lists", "", []);
    await query(`INSERT INTO lists (name, position) VALUES ($1, $2);`, [name, pos]);
  }
  return c.redirect("/");
});

app.post("/lists/:id/delete", async (c) => {
  await query(`DELETE FROM lists WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/");
});

// --- Boot --------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (database ${hasDatabase ? "provisioned" : "not provisioned"})`);

if (hasDatabase) {
  withRetry(initSchema).catch((e) => console.error("[db] schema init failed after retries:", e.message));
}
