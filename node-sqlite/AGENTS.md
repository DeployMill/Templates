# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs. Put code where the Dockerfile
> copies it, or change the Dockerfile to match. Most "my changes didn't deploy"
> problems are a file that never entered the image, or an entrypoint that was
> never updated.

**Stack:** Node 24 (Hono) + SQLite (`node:sqlite`) · **Workload:** web · **Port:** 3000

## What actually runs

The container runs exactly this (from the `Dockerfile`):

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint**. If your code doesn't run through it, it
doesn't run. To change what the app does, edit `src/index.js` (or import your new
modules into it) — **do not** add a parallel entrypoint (`server.js`, `app.js`)
and expect it to start; nothing calls it unless you also change `CMD`.

## SQLite, the way deploymill wires it

This template uses the **built-in `node:sqlite`** — no `better-sqlite3`, no
native addon, nothing to compile (sidesteps the pnpm native-build footgun). The
DB wiring lives in **`src/db.js`**; `src/index.js` imports `db` from it.

How persistence works:

1. Provision the database — add to `.deploymill/project.json`, then
   `reconcile_project` and `deploy`:
   ```json
   "database": { "provider": "sqlite" }
   ```
2. deploymill **auto-provisions a persistent volume** (no `mounts` entry needed)
   and **injects `DATABASE_URL=file:<path>.db`** pointing at a file on it.
3. `src/db.js` opens that path, so the data **survives restarts and redeploys**.

**Before** you provision, `DATABASE_URL` is unset. The container filesystem is
read-only (only volumes are writable), so `src/db.js` falls back to an
**in-memory** database: the first deploy still boots green, but data is
**ephemeral** and resets every restart. That fallback is a placeholder, **not the
destination** — never ship `:memory:` as the real store, and don't reach for it
when you mean "a database." Provision sqlite and the same code persists with no
change. The home page and the boot log both say which mode you're in.

## What ships into the image

Only these paths are copied into the runtime image:

| What | Path | Notes |
|------|------|-------|
| dependencies | `node_modules` | resolved from `package.json` at build (not committed) |
| manifest | `package.json` | declares deps + `"type": "module"` |
| your code | `src/` | everything here ships (`index.js` entrypoint, `db.js` DB wiring) |

**Anything outside `src/` is NOT in the image.** If you add a top-level file the
app needs at runtime, add a matching `COPY` line to the Dockerfile or it won't be
there. The `*.db` files are git-ignored and live on the volume at runtime — never
commit a database file into the repo (it won't be on the volume anyway).

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract — edit if you move files or change the port
├── package.json        # dependencies go here
├── src/
│   ├── index.js        # ← ENTRYPOINT (CMD runs this). HTTP routes start here.
│   └── db.js           # SQLite wiring: resolves DATABASE_URL → node:sqlite handle
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform); add the database block here
```

## Recipes

- **Change app behavior** → edit `src/index.js`, or add modules under `src/` and
  `import` them.
- **Query the database** → import `db` from `./db.js` and use the synchronous
  `node:sqlite` API:
  ```js
  import { db } from "./db.js";
  db.exec(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT);`);
  const insert = db.prepare(`INSERT INTO notes (body) VALUES (?);`);
  insert.run("hello");
  const rows = db.prepare(`SELECT * FROM notes;`).all();
  ```
  Run `CREATE TABLE IF NOT EXISTS` at boot as a lightweight migration; it's
  idempotent.
- **Add a dependency** → add it to `dependencies` in `package.json`. The build
  runs `pnpm install`, so the next deploy picks it up. (No lockfile is committed;
  add a `pnpm-lock.yaml` for reproducible installs — the Dockerfile already globs
  it.)
- **Native (C/C++) addon dep** (`bcrypt`, `sharp`, …) → pnpm **skips dependency
  build scripts by default**, so an unguarded install goes green and then
  crash-loops at runtime with `Could not locate the bindings file`. Add the
  package to `pnpm.onlyBuiltDependencies` in `package.json`. For SQLite you don't
  need this — `node:sqlite` is built in.
- **Change the port** → it's pinned in THREE places that must stay in sync:
  `EXPOSE` in the Dockerfile, `port` in `.deploymill/project.json`, and the
  `process.env.PORT || 3000` fallback in `index.js`. The platform sets `PORT` at
  runtime — always read it; never hardcode.
- **Health check** → `GET /healthz` must return `200`. It already runs
  `SELECT 1` so a broken DB fails the gate instead of shipping. deploymill probes
  it after every deploy and auto-rolls-back on a non-200.
- **Switch to Postgres later** → the connection contract is identical
  (`DATABASE_URL`), but the client differs. Swap `database.provider` and follow
  **`deploymill://guides/database/node`** for the `pg` wiring, or
  **`deploymill://guides/database/migrate-providers`** to move existing data.

## Gotchas

- Runs as the non-root `node` user. The image filesystem is effectively
  read-only — **only the provisioned volume is writable**, which is exactly where
  the injected `file:` `DATABASE_URL` points. Don't try to write the DB anywhere
  else.
- `node:sqlite` prints an `ExperimentalWarning` on startup. It's harmless — the
  module is shipped in Node 24 and stable enough for this use.
- The Dockerfile copies `src/` from the build **context** (not `--from=build`) on
  purpose: copying from the build stage can make BuildKit emit a byte-identical
  image and silently no-op a real edit. Keep it that way.
