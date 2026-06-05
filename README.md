# DeployMill — Official Starter Templates

This repo holds the **official starter templates** DeployMill uses to scaffold a
new app when an agent calls `start_project`. DeployMill fetches these at runtime,
so improvements here ship to every server **without a DeployMill deploy** (subject
to a short cache window).

These templates are **bases, not finished apps** — they exist to get the very
first deploy green and pin the container port. The agent then evolves the app
(framework, deps, routes, database) on top of the scaffold.

## What's here

| Directory        | Stack  | Workload | Port | Starter                                   |
|------------------|--------|----------|------|-------------------------------------------|
| `static/`        | static | web      | 80   | HTML/CSS/JS served by nginx               |
| `node/`          | node   | web      | 3000 | Node 22 minimal HTTP server (Hono)        |
| `python/`        | python | web      | 8000 | FastAPI HTTP server                       |
| `worker-node/`   | node   | worker   | —    | Node 22 long-running background worker    |
| `worker-python/` | python | worker   | —    | Python long-running background worker     |

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
  "description": "Node 22 minimal HTTP server (Hono).",
  "port": 3000,             // container port for web; null for workers
  "buildType": "dockerfile" // every template builds from its Dockerfile
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
    { "dir": "worker-python" }
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
3. List the directory in the root `deploymill.json`.

Keep starters **minimal** — the goal is "first deploy green," not a feature-rich
app.

## How DeployMill reads this

DeployMill reads this **public** repo at runtime via the GitHub Git Trees API
(to list files) + `raw.githubusercontent.com` (to read them), caches the parsed
catalog briefly, and falls back to a copy vendored inside the server if this repo
is ever unreachable. It is read-only from DeployMill's side; changes are made
here, by PR.

## Bring your own templates (coming soon)

A future release lets an organization point DeployMill at **their own** templates
repo (public, or private via a connected source account) so they can bootstrap
apps from their own standardized starters. This repo is the reference for that
format — fork it as a starting point.
