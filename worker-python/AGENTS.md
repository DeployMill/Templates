# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs.

**Stack:** Python 3.13 · **Workload:** worker (headless) · **No port, no domain,
no health endpoint.** · **Stdlib only to start.**

## What this is

A long-running background process — a queue consumer, scheduler, or stream
worker. There is no HTTP server and nothing to curl; its output is its **stdout
logs**. deploymill keeps it running and restarts it if it exits.

## What actually runs

```
CMD ["python", "-m", "app.main"]
```

This runs `app/main.py` as a module, calling its `main()` (under the
`if __name__ == "__main__"` guard). So `app/main.py` is **THE entrypoint**.
Replace the placeholder loop with your real work, but **keep the process alive**
(the `while True: ... time.sleep(...)` loop). Edit `app/main.py` or add modules
under `app/`; if you move the entrypoint, update the `CMD`.

## What ships into the image

| What | Path | Notes |
|------|------|-------|
| your code | `app/` | everything here ships |

**This starter installs NO dependencies** — it's stdlib-only. **Anything outside
`app/` is NOT in the image.**

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── pyproject.toml      # dependencies (empty to start)
├── app/
│   └── main.py         # ← ENTRYPOINT: main() runs your long-running worker loop
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform)
```

## Recipes

- **Do real work** → replace the heartbeat in `app/main.py`'s loop (poll a queue,
  run a sweep, consume a stream). Keep the loop so the process stays alive.
- **Add a dependency** → this template has **no install step**. To add libraries:
  declare them in `pyproject.toml`, then switch the Dockerfile to a `uv`-based
  build (copy the build stage from the **web** `python` template) so they're
  installed before `app.main` imports them. Stdlib-only needs no change.
- **Handle shutdown** → the template already traps `SIGTERM` and exits cleanly;
  do cleanup there before exit.

## Adding a database or a volume

Add these when the worker needs to persist or read state. The platform
provisions the resource and **injects the connection as an env var** — you never
hardcode credentials.

- **Database** (`postgres` · `neon` · `supabase` · `sqlite`) → add to
  `.deploymill/project.json`, then `reconcile_project` and `deploy`:
  ```json
  "database": { "provider": "sqlite" }
  ```
  The worker reads **`os.environ["DATABASE_URL"]`** — identical across providers.
  `sqlite` auto-provisions its own volume. The client (`psycopg`), pooling, and
  `alembic` migration pattern are in **`deploymill://guides/database/python`** —
  but note that guide is written for a *web* app: its `/db` health route and
  health-gated deploy don't apply to a worker (no HTTP edge), so skip those and
  keep the client/pool/migration parts. (Adding deps also means switching this
  template's Dockerfile to the `uv` build — see the dependency recipe above.)
- **Persistent volume** → add a `mounts` entry, reconcile, deploy:
  ```json
  "mounts": [{ "volumeName": "data", "mountPath": "/data", "sizeGb": 10 }]
  ```
  Grow-only. See **`deploymill://guides/storage`**.

## Secrets & environment variables (API keys, third-party services)

When the worker needs config or a credential — an API key for the queue/service
it talks to, an OAuth secret, a feature flag — read it from **`os.environ["X"]`**
(never hardcode, never commit a key). deploymill injects these two ways:

- **Non-secret config** (public IDs, feature flags, tuning) → `set_env_vars`
  (with `list_env_vars` / `delete_env_vars` to manage). A redeploy applies it.
- **Secrets** (API keys, tokens, OAuth client secrets) → the **vault hand-off**,
  so the value never passes through the agent or the logs: `request_secret`
  returns a browser link the human pastes the value into, then `bind_secret`
  exposes it to the worker as an env var. Org-scoped, so the same secret is
  reusable across apps. Full contract (incl. config-as-code via a `secrets` array
  in `project.json`): **`deploymill://guides/secrets`**.

Reaching out to third-party services needs **open egress** — available on a paid
tier; the free Explore floor keeps egress locked.

## Gotchas

- Runs as the non-root `appuser` with Linux capabilities dropped — use a mounted
  volume for persistence.
- No port / no `EXPOSE` / no `/healthz` — intentional for a worker. If you need an
  HTTP endpoint, use the **web** `python` template instead.
