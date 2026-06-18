# {{PROJECT_NAME}} — To-do list (how it builds, runs, and gets remixed)

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.

**Stack:** Node 24 (Hono) + Postgres · **Workload:** web · **Port:** 3000

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — lists, tasks, and every route.
`src/db.js` holds the Postgres pool wiring. Anything outside `src/` and `public/`
is **not** in the image.

## The database (already wired)

`deploymill.json` declares a managed Postgres database, so `start_project`
provisions it and injects **`DATABASE_URL`** before the first deploy. `src/db.js`
reads `process.env.DATABASE_URL`; `initSchema()` runs `CREATE TABLE IF NOT
EXISTS` on boot. Identical env var across providers ⇒ switch providers later with
zero code change (`deploymill://guides/database/migrate-providers`).

- **Schema:** `lists(id, name, position)` and
  `tasks(id, list_id→lists, title, notes, due_date, done, position, created_at)`.
- **Seed:** one default list ("My Tasks") + a couple example tasks on first boot.
- **Health:** `GET /healthz` is **liveness only** so a warming DB never trips a
  false auto-rollback.

## Make it yours (remix knobs)

- **Add fields to tasks** — tags, priority, a recurring flag. One-place edit:
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT;` in `initSchema()`,
  add the input to the add-task `<form>`, render it in `taskView()`.
- **Group differently** — by project, or by day. The `GET /?filter=` query param
  already filters today/overdue/all; extend `match()` for more views.
- **Restyle** — dark mode / accent color via the CSS variables in `layout()`.

## Upgrade prompts (paid envelope — not free-tier)

- **Private list** behind a password → `set_app_protection`.
- **Email/Slack reminders** for due tasks → bind a provider secret
  (`request_secret` / `bind_secret`; needs open egress) and a `schedules` entry.

## Constraints (free tier)

State **only** in managed Postgres: no volumes, no uploads, no outbound calls.
Only deps: `hono`, `@hono/node-server`, `pg`. Listen on `0.0.0.0:$PORT`; keep
`/healthz` fast and 200.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── package.json        # deps: hono, @hono/node-server, pg
├── src/
│   ├── index.js        # ← ENTRYPOINT: lists, tasks, routes
│   └── db.js           # Postgres pool + retry helpers
├── public/             # static assets (copied into the image)
└── AGENTS.md           # this file
```
