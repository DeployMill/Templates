// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// The Postgres wiring lives in src/db.js. See AGENTS.md for the full contract,
// the pasted-URL cover rule, the no-email / no-auth caveats, and remix knobs.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html, raw } from "hono/html";
import { hasDatabase, query, withRetry } from "./db.js";

// --- Schema + seed -----------------------------------------------------------
// Single-row event (id=1) + a guest list. Idempotent on every boot.
let dbReady = false;

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS event (
      id          INT PRIMARY KEY DEFAULT 1,
      title       TEXT,
      description TEXT,
      starts_at   TIMESTAMPTZ,
      location    TEXT,
      cover_url   TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT event_singleton CHECK (id = 1)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'yes',
      guests     INT  NOT NULL DEFAULT 0,
      note       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { rows } = await query(`SELECT count(*)::int AS n FROM event;`);
  if (rows[0].n === 0) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    await query(
      `INSERT INTO event (id, title, description, starts_at, location, cover_url)
       VALUES (1, $1, $2, $3, $4, '');`,
      ["My Event", "Tell your guests what this is about. Edit at /edit.", start.toISOString(), "Somewhere nice"]
    );
  }
  dbReady = true;
  console.log("[db] schema ready");
}

// --- Spam guard: a tiny in-memory per-IP rate limit on RSVP submits. ----------
// In-memory is fine for a single-process starter; it resets on redeploy.
const lastRsvp = new Map();
function rsvpAllowed(ip) {
  const now = Date.now();
  const prev = lastRsvp.get(ip) ?? 0;
  if (now - prev < 5000) return false; // at most one RSVP per 5s per IP
  lastRsvp.set(ip, now);
  return true;
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
    :root { --bg:#0f172a; --card:#fff; --ink:#0f172a; --muted:#64748b; --accent:#7c3aed; }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.6 system-ui,sans-serif; background:var(--bg); color:var(--ink); }
    .wrap { max-width:640px; margin:0 auto; padding:24px; }
    .cover { width:100%; aspect-ratio:16/7; object-fit:cover; border-radius:16px; background:#334155; display:block; }
    .card { background:var(--card); border-radius:16px; padding:22px; margin-top:-40px; position:relative; box-shadow:0 10px 30px rgba(0,0,0,.25); }
    h1 { margin:0 0 4px; font-size:24px; }
    .meta { color:var(--muted); }
    .section { background:var(--card); border-radius:16px; padding:20px; margin-top:16px; }
    .count { display:flex; gap:16px; font-weight:700; margin-bottom:10px; }
    .count span { color:var(--muted); font-weight:500; }
    .guest { display:flex; justify-content:space-between; padding:7px 0; border-top:1px solid #f1f5f9; }
    .badge { font-size:12px; padding:2px 8px; border-radius:99px; background:#ede9fe; color:#6d28d9; }
    form { display:grid; gap:8px; }
    input, textarea, select { font:inherit; width:100%; padding:9px 11px; border:1px solid #cbd5e1; border-radius:9px; }
    label { font-size:13px; color:var(--muted); }
    button { font:inherit; border:0; border-radius:10px; padding:11px; cursor:pointer; background:var(--accent); color:#fff; font-weight:600; }
    .row { display:flex; gap:8px; }
    a.edit { color:#c4b5fd; font-size:13px; text-decoration:none; }
    .banner { background:#fffbeb; color:#92400e; border:1px solid #fde68a; padding:16px; border-radius:12px; }
  </style>
</head>
<body><div class="wrap">${body}</div>
<!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge--></body>
</html>`;
}

function fmtDate(d) {
  if (!d) return "Date TBD";
  try {
    return new Date(d).toLocaleString("en-US", { weekday: "short", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return String(d);
  }
}

// --- App ---------------------------------------------------------------------
const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true, database: hasDatabase ? (dbReady ? "ready" : "starting") : "none" }));

async function getEvent() {
  return (await query(`SELECT * FROM event WHERE id = 1;`)).rows[0] ?? null;
}

app.get("/", async (c) => {
  if (!hasDatabase) return c.html(layout(APP_TITLE, html`<div class="section banner"><strong>No database yet.</strong> Ask your agent to add one (<code>reconcile_project</code>), or wait a moment if you just launched.</div>`));
  if (!dbReady) return c.html(layout(APP_TITLE, html`<div class="section banner">Starting up — refresh in a few seconds.</div>`));
  const ev = await getEvent();
  const rsvps = (await query(`SELECT * FROM rsvps ORDER BY created_at;`)).rows;
  const counts = { yes: 0, maybe: 0, no: 0 };
  let heads = 0;
  for (const r of rsvps) {
    if (counts[r.status] !== undefined) counts[r.status]++;
    if (r.status === "yes") heads += 1 + (r.guests || 0);
  }
  const body = html`
    ${ev.cover_url ? html`<img class="cover" src="${ev.cover_url}" alt="" />` : html`<div class="cover"></div>`}
    <div class="card">
      <h1>${ev.title || "Untitled event"}</h1>
      <div class="meta">📅 ${fmtDate(ev.starts_at)}</div>
      ${ev.location ? html`<div class="meta">📍 ${ev.location}</div>` : ""}
      ${ev.description ? html`<p>${ev.description}</p>` : ""}
      <a class="edit" href="/edit">Host? Edit this event</a>
    </div>

    <div class="section">
      <h2>RSVP</h2>
      <form method="post" action="/rsvp">
        <label>Your name</label><input name="name" required maxlength="80" />
        <div class="row">
          <select name="status"><option value="yes">Going</option><option value="maybe">Maybe</option><option value="no">Can't make it</option></select>
          <input name="guests" type="number" min="0" max="20" value="0" title="Extra guests" />
        </div>
        <label>Note (optional)</label><input name="note" maxlength="200" />
        <button type="submit">Send RSVP</button>
      </form>
    </div>

    <div class="section">
      <div class="count">${heads} going <span>· ${counts.maybe} maybe · ${counts.no} no</span></div>
      ${raw(rsvps.map((r) => html`<div class="guest"><span>${r.name}${r.guests ? ` +${r.guests}` : ""}${r.note ? html` <span class="meta">— ${r.note}</span>` : ""}</span><span class="badge">${r.status}</span></div>`.toString()).join("")) || html`<div class="meta">Be the first to RSVP.</div>`}
    </div>`;
  return c.html(layout(ev.title || APP_TITLE, body));
});

app.post("/rsvp", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rsvpAllowed(ip)) return c.redirect("/");
  const f = await c.req.parseBody();
  const name = String(f.name ?? "").trim().slice(0, 80);
  const status = ["yes", "maybe", "no"].includes(String(f.status)) ? String(f.status) : "yes";
  const guests = Math.max(0, Math.min(20, Number(f.guests) || 0));
  if (name) {
    await query(`INSERT INTO rsvps (name, status, guests, note) VALUES ($1, $2, $3, $4);`, [
      name,
      status,
      guests,
      String(f.note ?? "").slice(0, 200) || null,
    ]);
  }
  return c.redirect("/");
});

// Host edit UI. NOTE: no auth on the free tier — see AGENTS.md (gating /edit
// with a bound-secret password is a natural upgrade step).
app.get("/edit", async (c) => {
  if (!hasDatabase || !dbReady) return c.redirect("/");
  const ev = await getEvent();
  const startsLocal = ev.starts_at ? new Date(ev.starts_at).toISOString().slice(0, 16) : "";
  const body = html`
    <div class="section">
      <a class="edit" href="/" style="color:var(--accent)">← Back to event</a>
      <h1>Edit event</h1>
      <form method="post" action="/edit">
        <label>Title</label><input name="title" value="${ev.title ?? ""}" />
        <label>Description</label><textarea name="description" rows="3">${ev.description ?? ""}</textarea>
        <label>Starts at</label><input name="starts_at" type="datetime-local" value="${startsLocal}" />
        <label>Location</label><input name="location" value="${ev.location ?? ""}" />
        <label>Cover image URL (pasted link — no uploads on the free tier)</label>
        <input name="cover_url" value="${ev.cover_url ?? ""}" placeholder="https://…" />
        <button type="submit">Save event</button>
      </form>
    </div>`;
  return c.html(layout("Edit · " + APP_TITLE, body));
});

app.post("/edit", async (c) => {
  const f = await c.req.parseBody();
  const startsAt = String(f.starts_at ?? "").trim();
  await query(
    `UPDATE event SET title = $1, description = $2, starts_at = $3, location = $4, cover_url = $5, updated_at = now() WHERE id = 1;`,
    [
      String(f.title ?? ""),
      String(f.description ?? ""),
      startsAt ? new Date(startsAt).toISOString() : null,
      String(f.location ?? ""),
      String(f.cover_url ?? ""),
    ]
  );
  return c.redirect("/");
});

// --- Boot --------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (database ${hasDatabase ? "provisioned" : "not provisioned"})`);

if (hasDatabase) {
  withRetry(initSchema).catch((e) => console.error("[db] schema init failed after retries:", e.message));
}
