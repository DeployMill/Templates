# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs.

**Stack:** Node 24 · **Workload:** worker (headless) · **No port, no domain, no
health endpoint.**

## What this is

A long-running background process — a queue consumer, scheduler, or stream
worker. There is no HTTP server and nothing to curl; its output is its **stdout
logs**. deploymill keeps it running and restarts it if it exits.

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint**. Replace the placeholder heartbeat loop with
your real recurring work — but **keep the process alive** (an open timer, socket,
or loop). If the event loop drains, Node exits and the platform restarts it. Edit
`src/index.js` or import modules into it; don't add a parallel entrypoint unless
you change `CMD`.

## What ships into the image

| What | Path | Notes |
|------|------|-------|
| dependencies | `node_modules` | resolved from `package.json` at build (not committed) |
| manifest | `package.json` | declares deps + `"type": "module"` |
| your code | `src/` | everything here ships |

**Anything outside `src/` is NOT in the image.** Add a `COPY` line if you need
something else at runtime.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract
├── package.json        # dependencies go here
├── src/
│   └── index.js        # ← ENTRYPOINT: your long-running worker loop
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform)
```

## Recipes

- **Do real work** → replace the `doWork()` heartbeat in `src/index.js` (poll a
  queue, run a sweep, consume a stream). Keep the keep-alive timer/loop.
- **Add a dependency** → add it to `dependencies` in `package.json`; the next
  deploy runs `pnpm install`. (This starter has none.)
- **Handle shutdown** → the template already traps `SIGTERM` and exits cleanly;
  do your cleanup there (drain in-flight work, close connections) before exit.

## Gotchas

- Runs as the non-root `node` user with Linux capabilities dropped — use a
  mounted volume for persistence, not the image filesystem.
- No port / no `EXPOSE` / no `/healthz` — this is intentional for a worker. If you
  actually need an HTTP endpoint, you want the **web** `node` template instead.
