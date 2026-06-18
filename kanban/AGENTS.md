# {{PROJECT_NAME}} — Kanban board (how it builds, runs, and gets remixed)

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.
> Most "my changes didn't deploy" problems are a file that never entered the
> image, or an entrypoint that was never updated.

**Stack:** Node 24 (Hono) + Postgres · **Workload:** web · **Port:** 3000

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — the board UI, the schema, and every route.
`src/db.js` holds the Postgres pool wiring. Anything outside `src/` and `public/`
is **not** in the image; add a `COPY` line if the app needs it at runtime.

## The database (already wired)

This template declares a managed Postgres database in `deploymill.json`, so
`start_project` provisions one and injects **`DATABASE_URL`** before the first
deploy. The app reads `process.env.DATABASE_URL` (see `src/db.js`) and runs
`CREATE TABLE IF NOT EXISTS` on boot — no migration tooling, no setup. The same
env var is injected for every Postgres provider, so you can switch providers
later with **zero code change** (see `deploymill://guides/database/migrate-providers`).

- **Schema:** `columns(id, name, position)` and
  `cards(id, column_id→columns, title, body, label, position, created_at)`.
- **Seed:** three columns (To Do / In Progress / Done) + a few example cards on
  first boot only.
- **Health:** `GET /healthz` is **liveness only** (200 as soon as the process is
  up) so a warming database never trips a false auto-rollback.

## Make it yours (remix knobs)

This is the "watch your agent change it live" demo — each of these is a small,
local edit:

- **Repurpose the board.** Rename/recolor the columns and labels to turn it into
  a CRM pipeline, a content calendar, or a bug tracker. Columns are data — edit
  them in the UI, or change the seed list in `initSchema()`.
- **Add a field to cards** (assignee, due date, priority). It's a one-place edit:
  add `ALTER TABLE cards ADD COLUMN IF NOT EXISTS assignee TEXT;` to
  `initSchema()`, add the input to the add-card `<form>`, and render it in
  `cardView()`.
- **Real drag-and-drop.** The move buttons (`POST /cards/:id/move`) are the
  robust fallback; wire the native HTML5 drag API to the same endpoint for true
  drag-and-drop.
- **Theme it.** The look is CSS variables at the top of `layout()` — change
  `--accent`, `--bg`, fonts.

## Upgrade prompts (paid envelope — not free-tier)

These need a card on file (Builder); mention them, don't half-build them:

- **Lock the board** behind a password → `set_app_protection`.
- **Notify on changes** (email/Slack when a card moves) → bind a provider secret
  with `request_secret` / `bind_secret` (needs open egress).

## Constraints (free tier — keep it inside the box)

State lives **only** in managed Postgres: no volumes, no file/image uploads, no
outbound calls. Only deps: `hono`, `@hono/node-server`, `pg`. Listen on
`0.0.0.0:$PORT`. Keep `/healthz` fast and 200.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── package.json        # deps: hono, @hono/node-server, pg
├── src/
│   ├── index.js        # ← ENTRYPOINT: board UI, schema, routes
│   └── db.js           # Postgres pool + retry helpers
├── public/             # static assets (copied into the image)
└── AGENTS.md           # this file
```
