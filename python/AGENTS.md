# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs. Put code where the Dockerfile
> copies it, or change the Dockerfile to match. Most "my changes didn't deploy"
> problems are a file that never entered the image, or an entrypoint that was
> never updated.

**Stack:** Python 3.13 (FastAPI) · **Workload:** web · **Port:** 8000

## What actually runs

The container runs exactly this (from the `Dockerfile`):

```
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`uvicorn app.main:app` means: import the module `app/main.py` and serve the ASGI
object named **`app`** in it. So `app/main.py` is **THE entrypoint**, and it must
keep exposing a module-level `app`. To change behavior, edit `app/main.py` (or
add modules under `app/` and import them). If you rename the file or the `app`
variable — or switch framework (Flask/Django) — you **must** update the `CMD`
accordingly, or the deploy keeps serving the old target.

## What ships into the image

| What | Path | Notes |
|------|------|-------|
| dependencies | system `site-packages` | installed from `pyproject.toml` at build via `uv` |
| your code | `app/` | everything here ships |

**Anything outside `app/` is NOT in the image.** Add a `COPY` line if the app
needs something else at runtime.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract — edit if you move files or change the port
├── pyproject.toml      # dependencies go here ([project].dependencies)
├── app/
│   └── main.py         # ← ENTRYPOINT: defines `app = FastAPI()` (uvicorn serves it)
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform); port lives here too
```

## Recipes

- **Change app behavior** → edit `app/main.py`, or add modules under `app/` and
  import them. Keep a module-level `app` ASGI object (or update `CMD`).
- **Add a dependency** → add it to `dependencies` in `pyproject.toml`. The build
  runs `uv pip install`, so the next deploy installs it.
- **Change the port** → keep `EXPOSE` (Dockerfile), `port`
  (`.deploymill/project.json`), and the `${PORT:-8000}` in `CMD` in sync. The
  platform sets `PORT` at runtime — the `CMD` already reads it.
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
  The app reads the connection from **`os.environ["DATABASE_URL"]`** — identical
  for every provider, so you can swap providers later with no code change.
  `sqlite` auto-provisions its own volume (no `mounts` entry needed). The only
  part that touches your code — the client (`psycopg`), the connection-pool
  pattern, `alembic` migrations, and a `/db` health probe — is in
  **`deploymill://guides/database/python`**. (Switching providers later:
  **`deploymill://guides/database/migrate-providers`**.)
- **Object storage** (S3-compatible bucket) → add `storage` to `project.json`,
  reconcile, deploy. The `S3_*` env vars are injected; wiring (`boto3`) is in
  **`deploymill://guides/storage/python`**.
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

- Runs as the non-root `appuser`. The filesystem is effectively read-only and
  Linux capabilities are dropped — for persistence use a mounted volume.
- The base image is `python:3.13-slim`; the runtime stage copies
  `site-packages` from `/usr/local/lib/python3.13/...`. If you change the Python
  minor version in the base image, update that copy path too.
