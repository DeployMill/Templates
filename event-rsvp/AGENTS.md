# {{PROJECT_NAME}} — Event + RSVP (how it builds, runs, and gets remixed)

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.

**Stack:** Node 24 (Hono) + Postgres · **Workload:** web · **Port:** 3000

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — the public event page, the RSVP form, the
live guest list, and the `/edit` host UI. `src/db.js` holds the Postgres pool
wiring. Anything outside `src/` and `public/` is **not** in the image.

This page is meant to be **shared** on its `*.deploymill.app` subdomain so guests
can RSVP from the link.

## The database (already wired)

`deploymill.json` declares a managed Postgres database, so `start_project`
provisions it and injects **`DATABASE_URL`** before the first deploy. `src/db.js`
reads `process.env.DATABASE_URL`; `initSchema()` runs `CREATE TABLE IF NOT
EXISTS` on boot. Identical env var across providers ⇒ switch later with zero code
change (`deploymill://guides/database/migrate-providers`).

- **Schema:** single-row `event(id=1, title, description, starts_at, location,
  cover_url, updated_at)` and
  `rsvps(id, name, status[yes|maybe|no], guests, note, created_at)`.
- **Seed:** a sample event ~two weeks out on first boot.
- **Routes:** `GET /` event page + RSVP form + live guest list · `POST /rsvp`
  (light validation + a per-IP in-memory rate guard) · `GET /edit` + `POST /edit`
  host editor.
- **Health:** `GET /healthz` is **liveness only**.

## Free-tier rules (don't promise what the box can't do)

- **Cover image = pasted URL** stored as a string. No uploads, no object storage.
- **No email.** Egress is locked, so there are **no email confirmations or
  reminders** — the on-page guest list IS the confirmation. Don't add a "we'll
  email you" button that can't fire; make email an explicit upgrade prompt.

## No auth on `/edit` (read this)

`/edit` is **unprotected** on the free tier. Call it out; gating it is the natural
upgrade step:

- **Password the host editor** → `set_app_protection` (paid envelope), or check a
  bound-secret password in the `/edit` handler (`request_secret` / `bind_secret`).

## Make it yours (remix knobs)

- **Add RSVP fields** — dress code, a dietary question, a capacity cap that closes
  RSVPs once `heads` hits a limit.
- **Multiple events** — promote the single-row `event` to a real table and add
  `/e/:id` per event.
- **Theme + countdown** — restyle via the CSS variables; add a live countdown to
  `starts_at`.

## Upgrade prompts (paid envelope)

- **Email invites/reminders** → bind an email-provider secret (`request_secret` /
  `bind_secret`; needs open egress) + a `schedules` entry for reminder ticks.

## Constraints (free tier)

State **only** in managed Postgres: no volumes, no uploads/object storage, no
outbound calls, no email. Only deps: `hono`, `@hono/node-server`, `pg`. Listen on
`0.0.0.0:$PORT`; keep `/healthz` fast and 200.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── package.json        # deps: hono, @hono/node-server, pg
├── src/
│   ├── index.js        # ← ENTRYPOINT: event page, RSVP, /edit, routes
│   └── db.js           # Postgres pool + retry helpers
├── public/             # static assets (copied into the image)
└── AGENTS.md           # this file
```
