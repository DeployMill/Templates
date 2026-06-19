// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
// The Postgres wiring lives in src/db.js. See AGENTS.md for the full contract,
// the pasted-URL image rule, the no-auth caveat, and the remix knobs.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html, raw } from "hono/html";
import { hasDatabase, query, withRetry } from "./db.js";

// --- Schema + seed -----------------------------------------------------------
// Single-row profile (id=1) + an ordered list of links. CREATE TABLE IF NOT
// EXISTS is idempotent — safe to re-run every boot.
let dbReady = false;

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS profile (
      id           INT PRIMARY KEY DEFAULT 1,
      display_name TEXT,
      bio          TEXT,
      avatar_url   TEXT,
      theme        TEXT NOT NULL DEFAULT 'light',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT profile_singleton CHECK (id = 1)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS links (
      id       SERIAL PRIMARY KEY,
      label    TEXT NOT NULL,
      url      TEXT NOT NULL,
      position INT  NOT NULL,
      clicks   INT  NOT NULL DEFAULT 0
    );
  `);
  // Seed a sample profile + 3 example links on first boot only.
  const { rows } = await query(`SELECT count(*)::int AS n FROM profile;`);
  if (rows[0].n === 0) {
    await query(
      `INSERT INTO profile (id, display_name, bio, avatar_url, theme) VALUES (1, $1, $2, $3, 'light');`,
      ["Your Name", "A short bio goes here. Edit me at /admin.", ""]
    );
    const seed = [
      ["My website", "https://example.com"],
      ["Follow me", "https://example.com/social"],
      ["Email me", "mailto:you@example.com"],
    ];
    for (let i = 0; i < seed.length; i++) {
      await query(`INSERT INTO links (label, url, position) VALUES ($1, $2, $3);`, [seed[i][0], seed[i][1], i]);
    }
  }
  dbReady = true;
  console.log("[db] schema ready");
}

// --- Views -------------------------------------------------------------------
const THEMES = {
  light: { bg: "#f3f4f6", card: "#ffffff", ink: "#111827", btn: "#111827", btnInk: "#ffffff" },
  dark: { bg: "#0b1020", card: "#161c2d", ink: "#e5e7eb", btn: "#e5e7eb", btnInk: "#0b1020" },
  sunset: { bg: "#fff1e6", card: "#fff", ink: "#7c2d12", btn: "#ea580c", btnInk: "#fff" },
};

function page(theme, body, title) {
  const t = THEMES[theme] ?? THEMES.light;
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; font:16px/1.5 system-ui,sans-serif;
           background:${t.bg}; color:${t.ink}; display:flex; justify-content:center; }
    .wrap { width:100%; max-width:520px; padding:40px 20px; }
    .avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; display:block; margin:0 auto 14px;
              background:#d1d5db; border:3px solid ${t.card}; }
    h1 { text-align:center; margin:0 0 6px; font-size:22px; }
    .bio { text-align:center; color:${t.ink}; opacity:.8; margin:0 0 24px; }
    a.link { display:block; background:${t.btn}; color:${t.btnInk}; text-decoration:none; text-align:center;
             padding:14px; border-radius:12px; margin-bottom:12px; font-weight:600; }
    .card { background:${t.card}; border-radius:16px; padding:20px; }
    .admin { display:grid; gap:6px; }
    input, textarea, select { font:inherit; width:100%; padding:9px 11px; border:1px solid #cbd5e1; border-radius:9px; }
    label { font-size:13px; opacity:.8; margin-top:8px; }
    button { font:inherit; border:0; border-radius:9px; padding:9px 12px; cursor:pointer; background:${t.btn}; color:${t.btnInk}; }
    .row { display:flex; gap:8px; align-items:center; }
    .muted { opacity:.7; font-size:13px; }
    .banner { background:#fffbeb; color:#92400e; border:1px solid #fde68a; padding:16px; border-radius:12px; }
    .topnav { text-align:center; margin-bottom:18px; }
    .topnav a { color:inherit; opacity:.7; font-size:13px; text-decoration:none; }
  </style>
</head>
<body><div class="wrap">${body}</div>
<!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge--></body>
</html>`;
}

// --- App ---------------------------------------------------------------------
const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true, database: hasDatabase ? (dbReady ? "ready" : "starting") : "none" }));

async function getProfile() {
  return (await query(`SELECT * FROM profile WHERE id = 1;`)).rows[0] ?? { theme: "light" };
}

// Public page.
app.get("/", async (c) => {
  if (!hasDatabase) return c.html(page("light", html`<div class="banner"><strong>No database yet.</strong> Ask your agent to add one (<code>reconcile_project</code>), or wait a moment if you just launched.</div>`, "{{PROJECT_NAME}}"));
  if (!dbReady) return c.html(page("light", html`<div class="banner">Starting up — refresh in a few seconds.</div>`, "{{PROJECT_NAME}}"));
  const profile = await getProfile();
  const links = (await query(`SELECT * FROM links ORDER BY position, id;`)).rows;
  const body = html`
    ${profile.avatar_url ? html`<img class="avatar" src="${profile.avatar_url}" alt="" />` : html`<div class="avatar"></div>`}
    <h1>${profile.display_name || "Your Name"}</h1>
    ${profile.bio ? html`<p class="bio">${profile.bio}</p>` : ""}
    ${raw(links.map((l) => html`<a class="link" href="/l/${l.id}">${l.label}</a>`.toString()).join(""))}
    <div class="topnav"><a href="/admin">Edit this page</a></div>`;
  return c.html(page(profile.theme, body, profile.display_name || "{{PROJECT_NAME}}"));
});

// Click-through: count + redirect. A browser-side 302 is allowed under locked egress.
app.get("/l/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await query(`UPDATE links SET clicks = clicks + 1 WHERE id = $1 RETURNING url;`, [id]);
  const url = r.rows[0]?.url;
  return url ? c.redirect(url) : c.redirect("/");
});

// Admin edit UI. NOTE: no auth on the free tier — see AGENTS.md (gating /admin
// with a bound-secret password is a natural "make it yours / upgrade" step).
app.get("/admin", async (c) => {
  if (!hasDatabase || !dbReady) return c.redirect("/");
  const profile = await getProfile();
  const links = (await query(`SELECT * FROM links ORDER BY position, id;`)).rows;
  const themeOpts = Object.keys(THEMES)
    .map((k) => `<option value="${k}"${k === profile.theme ? " selected" : ""}>${k}</option>`)
    .join("");
  const body = html`
    <div class="topnav"><a href="/">← View public page</a></div>
    <div class="card admin">
      <h1>Edit profile</h1>
      <form class="admin" method="post" action="/admin/profile">
        <label>Display name</label><input name="display_name" value="${profile.display_name ?? ""}" />
        <label>Bio</label><textarea name="bio" rows="2">${profile.bio ?? ""}</textarea>
        <label>Avatar URL (pasted link — no uploads on the free tier)</label>
        <input name="avatar_url" value="${profile.avatar_url ?? ""}" placeholder="https://…" />
        <label>Theme</label><select name="theme">${raw(themeOpts)}</select>
        <button type="submit">Save profile</button>
      </form>
    </div>
    <div class="card admin" style="margin-top:16px;">
      <h1>Links</h1>
      ${raw(links.map((l) => html`
        <form class="row" method="post" action="/admin/links/${l.id}">
          <input name="label" value="${l.label}" />
          <input name="url" value="${l.url}" />
          <span class="muted">${l.clicks}↗</span>
          <button type="submit">Save</button>
        </form>
        <form method="post" action="/admin/links/${l.id}/delete"><button class="muted">Delete</button></form>
      `.toString()).join(""))}
      <form class="admin" method="post" action="/admin/links" style="margin-top:10px;">
        <div class="row"><input name="label" placeholder="Label" required /><input name="url" placeholder="https://…" required /><button type="submit">+ Add</button></div>
      </form>
    </div>`;
  return c.html(page(profile.theme, body, "Edit · {{PROJECT_NAME}}"));
});

app.post("/admin/profile", async (c) => {
  const f = await c.req.parseBody();
  const theme = THEMES[String(f.theme)] ? String(f.theme) : "light";
  await query(
    `UPDATE profile SET display_name = $1, bio = $2, avatar_url = $3, theme = $4, updated_at = now() WHERE id = 1;`,
    [String(f.display_name ?? ""), String(f.bio ?? ""), String(f.avatar_url ?? ""), theme]
  );
  return c.redirect("/admin");
});

app.post("/admin/links", async (c) => {
  const f = await c.req.parseBody();
  const label = String(f.label ?? "").trim();
  const url = String(f.url ?? "").trim();
  if (label && url) {
    const r = await query(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM links;`);
    await query(`INSERT INTO links (label, url, position) VALUES ($1, $2, $3);`, [label, url, r.rows[0].p]);
  }
  return c.redirect("/admin");
});

app.post("/admin/links/:id", async (c) => {
  const f = await c.req.parseBody();
  await query(`UPDATE links SET label = $1, url = $2 WHERE id = $3;`, [
    String(f.label ?? ""),
    String(f.url ?? ""),
    Number(c.req.param("id")),
  ]);
  return c.redirect("/admin");
});

app.post("/admin/links/:id/delete", async (c) => {
  await query(`DELETE FROM links WHERE id = $1;`, [Number(c.req.param("id"))]);
  return c.redirect("/admin");
});

// --- Boot --------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (database ${hasDatabase ? "provisioned" : "not provisioned"})`);

if (hasDatabase) {
  withRetry(initSchema).catch((e) => console.error("[db] schema init failed after retries:", e.message));
}
