# {{PROJECT_NAME}} — Link in bio (how it builds, runs, and gets remixed)

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.

**Stack:** Node 24 (Hono) + Postgres · **Workload:** web · **Port:** 3000

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — the public page, the `/admin` editor, and
every route. `src/db.js` holds the Postgres pool wiring. Anything outside `src/`
and `public/` is **not** in the image.

This page is meant to be **shared** on its `*.deploymill.app` subdomain — the
subdomain link IS the product. (A custom domain is a paid-tier upgrade.)

## The database (already wired)

`deploymill.json` declares a managed Postgres database, so `start_project`
provisions it and injects **`DATABASE_URL`** before the first deploy. `src/db.js`
reads `process.env.DATABASE_URL`; `initSchema()` runs `CREATE TABLE IF NOT
EXISTS` on boot. Identical env var across providers ⇒ switch later with zero code
change (`deploymill://guides/database/migrate-providers`).

- **Schema:** single-row `profile(id=1, display_name, bio, avatar_url, theme,
  updated_at)` and `links(id, label, url, position, clicks)`.
- **Seed:** a sample profile + 3 example links on first boot.
- **Routes:** `GET /` public page · `GET /l/:id` counts a click then 302-redirects
  (a browser-side redirect is allowed under locked egress) · `GET /admin` editor.
- **Health:** `GET /healthz` is **liveness only**.

## Image rule (free tier)

The avatar is a **pasted URL stored as a string** — the browser fetches it. There
are **no server-side uploads and no object storage** on the free tier. Keep
images as URLs; don't add an upload endpoint here.

## No auth on `/admin` (read this)

`/admin` is **unprotected** on the free tier — anyone with the link can edit the
page. That's fine for a demo, but call it out. Gating `/admin` is the natural
"make it yours / upgrade" step:

- **Password the editor** → `set_app_protection` (paid envelope), or accept a
  password from a bound secret (`request_secret` / `bind_secret`) and check it in
  the `/admin` handler.

## Make it yours (remix knobs)

- **Themes** — add presets to the `THEMES` map (driven by `profile.theme` + CSS
  variables). Add a layout preset, a gradient, a font.
- **More profile fields** — social icons, a location, a featured "hero" link:
  `ALTER TABLE profile ADD COLUMN IF NOT EXISTS location TEXT;` then surface it.
- **Click analytics** — `links.clicks` is already tracked; add a `/admin/stats`
  page that lists per-link counts.

## Constraints (free tier)

State **only** in managed Postgres: no volumes, no uploads/object storage, no
outbound server calls (a browser 302 is fine). Only deps: `hono`,
`@hono/node-server`, `pg`. Listen on `0.0.0.0:$PORT`; keep `/healthz` fast and 200.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── package.json        # deps: hono, @hono/node-server, pg
├── src/
│   ├── index.js        # ← ENTRYPOINT: public page, /admin, routes
│   └── db.js           # Postgres pool + retry helpers
├── public/             # static assets (copied into the image)
└── AGENTS.md           # this file
```
