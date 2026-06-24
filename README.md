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
| `node-sqlite/`   | node-sqlite | web   | 3000 | Node 24 (Hono) + persistent SQLite (`node:sqlite`) |
| `python/`        | python   | web      | 8000 | FastAPI HTTP server                       |
| `mcp-node/`      | mcp-node | web      | 3000 | MCP server (Node.js) over Streamable HTTP |
| `worker-node/`   | node     | worker   | —    | Node 24 long-running background worker    |
| `worker-python/` | python   | worker   | —    | Python long-running background worker     |
| `kanban/`        | kanban   | web      | 3000 | Trello-style board (Hono + Postgres)      |
| `todo/`          | todo     | web      | 3000 | To-do / task list (Hono + Postgres)       |
| `link-in-bio/`   | link-in-bio | web   | 3000 | Linktree-style links page (Hono + Postgres) |
| `event-rsvp/`    | event-rsvp | web    | 3000 | Event page + RSVP guest list (Hono + Postgres) |
| `better-auth/`   | better-auth | web   | 3000 | Email/password auth + sessions, pre-wired (Better Auth + Postgres) |

A **web** template is an HTTP service that gets a port + a domain. A **worker**
is a headless long-running process (queue consumer, scheduler) with no port and
no domain.

### Curated free-tier starters (DB-backed, one-click)

`kanban`, `todo`, `link-in-bio`, and `event-rsvp` are the **curated starter
apps** (DET-603): real, useful apps a free **Explore**-tier user can launch and
then remix live with their agent. Each declares a managed Postgres database in
its `deploymill.json` (`"database": { "engine": "postgres", "provider":
"deploymill" }`), so `start_project` **provisions the database and injects
`DATABASE_URL` before the first deploy** — the app comes up working in a single
call, no extra reconcile. They're built to run inside the Explore free floor:
state only in managed Postgres (no volumes, no object storage, no uploads), no
outbound calls / third-party keys, subdomain-only. Their `AGENTS.md` documents
the "make it yours" remix knobs and flags the paid-tier upgrades (custom domain,
site protection, email) as prompts rather than broken buttons.

> **Manifest `database` field:** any web template can opt into provision-on-start
> by adding a `database` block to its `deploymill.json` (same two-axis shape as a
> project.json `database` field). Omit it and the template provisions no database,
> exactly as before.

Every web template (except `static`, which has no server) ships a
`POST /_system/tick` route alongside `/healthz` — the **scheduled-jobs
receiver**. Declare `schedules` in your app's `.deploymill/project.json` and
deploymill delivers each cron tick here; register the matching handler in the
template's `handlers`/`HANDLERS` map. See deploymill's
`deploymill://guides/schedules` for the full contract.

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

### The "Built on deploymill" badge

Every **web** starter renders a small fixed-position *"Built on deploymill"*
badge linking back to the marketing site (the free-tier attribution / virality
loop). Wrap it in the marker pair so DeployMill can strip it for paying orgs at
scaffold time:

```html
<!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" ...>⚡ Built on deploymill</a><!--/deploymill:badge-->
```

The content between the markers is **real HTML** — it renders fine with no server
processing (e.g. a direct clone of this repo), so it's safe in every ordering.
When an org's `removeBranding` entitlement is true (any paying plan), DeployMill
removes the marked block (markers + everything between) during `render`, so the
scaffold ships a clean page. Free scaffolds keep it. Worker / headless templates
(no human-facing page) don't carry the badge.

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
