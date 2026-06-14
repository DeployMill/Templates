# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs. Put code where the Dockerfile
> copies it, or change the Dockerfile to match. Most "my changes didn't deploy"
> problems are a file that never entered the image, or an entrypoint that was
> never updated.

**Stack:** Node 24 (Hono) · **Workload:** web · **Port:** 3000

## What actually runs

The container runs exactly this (from the `Dockerfile`):

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint**. If your code doesn't run through it, it
doesn't run. To change what the app does, edit `src/index.js` (or import your new
modules into it) — **do not** add a parallel entrypoint (`server.js`, `app.js`,
`index.ts`) and expect it to start; nothing calls it unless you also change `CMD`.

## What ships into the image

Only these paths are copied into the runtime image:

| What | Path | Notes |
|------|------|-------|
| dependencies | `node_modules` | resolved from `package.json` at build (not committed) |
| manifest | `package.json` | declares deps + `"type": "module"` |
| your code | `src/` | everything here ships |
| static assets | `public/` | shipped, but you must serve it (see recipes) |

**Anything outside `src/` and `public/` is NOT in the image.** If you add a
top-level file or directory the app needs at runtime, add a matching `COPY` line
to the Dockerfile or it won't be there.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract — edit if you move files or change the port
├── package.json        # dependencies go here
├── src/
│   └── index.js        # ← ENTRYPOINT (CMD runs this). The app starts here.
├── public/             # static files (copied into the image; serve via serveStatic)
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform); port lives here too
```

## Recipes

- **Change app behavior** → edit `src/index.js`, or add modules under `src/` and
  `import` them from `index.js`.
- **Add a dependency** → add it to `dependencies` in `package.json`. The build
  runs `pnpm install`, so the next deploy picks it up. (No lockfile is committed;
  add a `pnpm-lock.yaml` for reproducible installs — the Dockerfile already globs
  it.)
- **Native (C/C++) addon dep** (`better-sqlite3`, `bcrypt`, `sharp`, …) → pnpm
  **skips dependency build scripts by default**, so an unguarded install goes green
  and then crash-loops at runtime with `Could not locate the bindings file`. Add the
  package to `pnpm.onlyBuiltDependencies` in `package.json` (`better-sqlite3` is
  already there). The build stage installs `python3 make g++` for packages that must
  compile from source. Prefer the built-in `node:sqlite` (no addon) when SQLite is all
  you need.
- **Serve files from `public/`** → wire it in `index.js`:
  ```js
  import { serveStatic } from "@hono/node-server/serve-static";
  app.use("/*", serveStatic({ root: "./public" }));
  ```
- **Change the port** → it's pinned in THREE places that must stay in sync:
  `EXPOSE` in the Dockerfile, `port` in `.deploymill/project.json`, and the
  `process.env.PORT || 3000` fallback in `index.js`. The platform sets `PORT` at
  runtime — always read it; never hardcode.
- **Health check** → `GET /healthz` must return `200`. deploymill probes it after
  every deploy and auto-rolls-back on a non-200. Put real readiness checks there.

## Adding a database or a volume

You don't choose these at scaffold time — add them when you need them. The
platform provisions the resource and **injects the connection as an env var**;
you never hardcode or handle credentials.

- **Database** (`postgres` · `neon` · `supabase` · `sqlite`) → add to
  `.deploymill/project.json`, then `reconcile_project` (provisions it) and
  `deploy`:
  ```json
  "database": { "provider": "sqlite" }
  ```
  The app reads the connection from **`process.env.DATABASE_URL`** — identical
  for every provider, so you can swap providers later with no code change.
  `sqlite` auto-provisions its own volume (no `mounts` entry needed). The only
  part that touches your code — the client library (`pg`), the connection-pool
  pattern, migrations, and a `/db` health probe — is in
  **`deploymill://guides/database/node`**. (Switching providers later:
  **`deploymill://guides/database/migrate-providers`**.)
- **Object storage** (S3-compatible bucket) → add `storage` to `project.json`,
  reconcile, deploy. The `S3_*` env vars are injected; wiring (`@aws-sdk/client-s3`)
  is in **`deploymill://guides/storage/node`**.
- **Persistent volume** (cache, on-disk index, embedded store) → add a `mounts`
  entry, reconcile, deploy — it's attached at `mountPath`:
  ```json
  "mounts": [{ "volumeName": "data", "mountPath": "/data", "sizeGb": 10 }]
  ```
  Volumes are grow-only (raise `sizeGb` to expand; never lowered). See
  **`deploymill://guides/storage`**.

> Don't add a DB/storage client library "just in case" — add it only after the
> resource is provisioned and the env var exists, following the guide.

## Gotchas

- Runs as the non-root `node` user. The filesystem is effectively read-only and
  Linux capabilities are dropped — for persistence use a mounted volume, not the
  image filesystem.
- The Dockerfile copies `src/` from the build **context** (not `--from=build`) on
  purpose: copying from the build stage can make BuildKit emit a byte-identical
  image and silently no-op a real edit. Keep it that way.
