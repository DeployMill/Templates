# DeployMill — Official Starter Templates

This repo holds the **official starter templates** DeployMill uses to scaffold a
new app when an agent calls `start_project`. DeployMill fetches these at runtime,
so improvements here ship to every server **without a DeployMill deploy** (subject
to a short cache window).

These templates are **bases, not finished apps** — they exist to get the very
first deploy green and pin the container port. The agent then evolves the app
(framework, deps, routes, database) on top of the scaffold.

Every template ships an **`AGENTS.md`** that scaffolds into the new repo
alongside the code. It's the build/run/layout contract written **for the agent**:
which file is the entrypoint the Dockerfile actually runs, what paths get copied
into the image (and what therefore *won't* ship), where to put code vs. static
assets, and how to add deps or change the port. This is the fix for the classic
"my changes didn't deploy" trap — the deploy keeps running the starter because a
new file landed somewhere the Dockerfile never copies, or the entrypoint was
never updated. **Read `AGENTS.md` in the scaffolded repo before restructuring it.**

## What's here

| Directory        | Stack    | Workload | Port | Starter                                   |
|------------------|----------|----------|------|-------------------------------------------|
| `static/`        | static   | web      | 8080 | HTML/CSS/JS served by nginx               |
| `node/`          | node     | web      | 3000 | Node 24 minimal HTTP server (Hono)        |
| `python/`        | python   | web      | 8000 | FastAPI HTTP server                       |
| `mcp-node/`      | mcp-node | web      | 3000 | MCP server (Node.js) over Streamable HTTP |
| `worker-node/`   | node     | worker   | —    | Node 24 long-running background worker    |
| `worker-python/` | python   | worker   | —    | Python long-running background worker     |

A **web** template is an HTTP service that gets a port + a domain. A **worker**
is a headless long-running process (queue consumer, scheduler) with no port and
no domain.

## Manifest format

Each template directory carries its own `deploymill.json` describing it, and the
repo root carries a thin index `deploymill.json` listing the template directories.
This is the contract DeployMill reads — adding a template is "drop a directory +
its manifest + list it in the root index."

### Per-template `deploymill.json`

```jsonc
{
  "schemaVersion": 1,
  "stack": "node",          // stack key (groups web + worker variants together)
  "workload": "web",        // "web" (port + domain) or "worker" (headless)
  "title": "Node.js",       // shown in the list_templates catalog
  "description": "Node 24 minimal HTTP server (Hono).",
  "port": 3000,             // container port for web; null for workers
  "buildType": "dockerfile",// every template builds from its Dockerfile
  "hidden": false           // optional — true keeps the template out of the catalog
}
```

`stack` is what groups the web and worker variants of one runtime into a single
catalog entry: `node/` (workload `web`) and `worker-node/` (workload `worker`)
both have `stack: "node"`, so the catalog surfaces one `node` entry whose
`workloads` is `["web", "worker"]`. A stack must have a `web` variant to appear
in the catalog.

### Root `deploymill.json` (index)

```json
{
  "schemaVersion": 1,
  "templates": [
    { "dir": "static" },
    { "dir": "node" },
    { "dir": "python" },
    { "dir": "worker-node" },
    { "dir": "worker-python" },
    { "dir": "mcp-node" }
  ]
}
```

The root index is deliberately thin — just the directories to read. All metadata
lives in the per-directory manifest (one source of truth per template).

## Adding a template

1. Add a directory with the scaffold files. It **must** contain a `Dockerfile`
   (`buildType` is `dockerfile`). Use `{{PROJECT_NAME}}` anywhere the new
   project's name should be substituted in.
2. Add a `deploymill.json` to the directory (see the schema above).
3. Add an **`AGENTS.md`** to the directory — the agent-facing build/run/layout
   contract (entrypoint, what the Dockerfile copies, where code/assets go, how to
   add deps + change the port, gotchas). Copy an existing template's as the shape.
   Exclude it from the build in `.dockerignore` (it matters for `static`, whose
   Dockerfile `COPY . `s the whole root; harmless elsewhere).
4. List the directory in the root `deploymill.json`.

Keep starters **minimal** — the goal is "first deploy green," not a feature-rich
app. Every file in the directory (except its `deploymill.json` manifest) is
copied verbatim into the scaffolded repo with `{{PROJECT_NAME}}` substituted —
so `AGENTS.md` and any pointer comments ride along automatically.

## How DeployMill reads this

DeployMill reads this **public** repo at runtime via the GitHub Git Trees API
(to list files) + `raw.githubusercontent.com` (to read them), caches the parsed
catalog briefly, and persists every successful fetch to a durable on-disk
"last-good" cache. If this repo is ever unreachable it serves that last-good copy
(degrades to "slightly stale," never "broken") — there is no build-time vendored
copy inside the server. It is read-only from DeployMill's side; changes are made
here, by PR.

## Bring your own templates (coming soon)

A future release lets an organization point DeployMill at **their own** templates
repo (public, or private via a connected source account) so they can bootstrap
apps from their own standardized starters. This repo is the reference for that
format — fork it as a starting point.
