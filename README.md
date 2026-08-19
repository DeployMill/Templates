# DeployMill — Official Starter Templates

This repo holds the **official starter templates** DeployMill uses to scaffold a
new app when an agent calls `start_project`. DeployMill fetches these at runtime,
so improvements here ship to every server **without a DeployMill deploy** (subject
to a short cache window).

Templates come in **two kinds**, and every manifest declares which it is:

- **`kind: "runtime"`** — a base, not a finished app. It exists to get the very
  first deploy green and pin the container port; the agent then evolves the real
  app (framework, deps, routes, database) on top, typically **replacing** the
  scaffold outright on the first push. `static`, `node`, `node-sqlite`,
  `python`, and `mcp-node` are these.
- **`kind: "app"`** — a complete, working app the user **remixes** rather than
  replaces. `kanban`, `todo`, `link-in-bio`, `event-rsvp`, `better-auth` and
  `tutorial` are these. All but `tutorial` provision their own managed Postgres
  at scaffold time; `tutorial` deliberately ships without one (see below).

`list_templates` surfaces that distinction, so an agent can tell a throwaway
shell from a finished app *before* it picks one.

Every template ships an **`AGENTS.md`** that scaffolds into the new repo
alongside the code. It's the build/run/layout contract written **for the agent**:
which file is the entrypoint the Dockerfile actually runs, what paths get copied
into the image (and what therefore *won't* ship), where to put code vs. static
assets, and how to add deps or change the port. This is the fix for the classic
"my changes didn't deploy" trap — the deploy keeps running the starter because a
new file landed somewhere the Dockerfile never copies, or the entrypoint was
never updated. **Read `AGENTS.md` in the scaffolded repo before restructuring it.**

## What's here

| Directory        | Stack    | Kind    | Runtime | Workload | Port | Starter                                   |
|------------------|----------|---------|---------|----------|------|-------------------------------------------|
| `static/`        | static   | runtime | static  | web      | 8080 | HTML/CSS/JS served by nginx               |
| `node/`          | node     | runtime | node    | web      | 3000 | Node 24 minimal HTTP server (Hono)        |
| `node-sqlite/`   | node-sqlite | runtime | node | web    | 3000 | Node 24 (Hono) + persistent SQLite (`node:sqlite`) |
| `python/`        | python   | runtime | python  | web      | 8000 | FastAPI HTTP server                       |
| `mcp-node/`      | mcp-node | runtime | node    | web      | 3000 | MCP server (Node.js) over Streamable HTTP |
| `worker-node/`   | node     | runtime | node    | worker   | —    | Node 24 long-running background worker    |
| `worker-python/` | python   | runtime | python  | worker   | —    | Python long-running background worker     |
| `kanban/`        | kanban   | app     | node    | web      | 3000 | Trello-style board (Hono + Postgres)      |
| `todo/`          | todo     | app     | node    | web      | 3000 | To-do / task list (Hono + Postgres)       |
| `link-in-bio/`   | link-in-bio | app  | node    | web      | 3000 | Linktree-style links page (Hono + Postgres) |
| `event-rsvp/`    | event-rsvp | app   | node    | web      | 3000 | Event page + RSVP guest list (Hono + Postgres) |
| `better-auth/`   | better-auth | app  | node    | web      | 3000 | Email/password auth + sessions, pre-wired (Better Auth + Postgres) |
| `tutorial/`      | tutorial | app     | node    | web      | 3000 | The interactive onboarding tutorial (Hono, no database)  |

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
  "kind": "runtime",        // "runtime" (a base to replace) or "app" (remix it)
  "runtime": "node",        // scaffold language: "node" | "python" | "static"
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

`kind` tells an agent whether this is a base to **replace** or a finished app to
**remix** — it's the field they branch on when choosing. It's technically
optional: DeployMill infers it when absent (a template declaring a `database` is
treated as an app), but that's a back-compat fallback, not a contract. **Declare
it.**

`runtime` names the scaffold's language and selects the conventions guide the
agent is pointed at after scaffolding (`deploymill://guides/conventions/node`,
`…/python`). Also optional, and also worth declaring — without it DeployMill
falls back to matching the **stack key** against `node`/`python`, so any template
whose key isn't its language (every `app` template: `kanban`, `better-auth`, …)
gets **no conventions guide at all**. Note the catalog reads these from the
**web** variant, so a worker-only manifest's values never reach an entry — set
them anyway for consistency.

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
   (`buildType` is `dockerfile`). To show the project's name, read the
   `DM_PROJECT_NAME` environment variable that DeployMill injects at run time —
   **not** the `{{PROJECT_NAME}}` scaffold-time placeholder (see below).
2. Add a `deploymill.json` to the directory (see the schema above). Set `kind`
   and `runtime` explicitly — don't lean on the inference fallbacks.
3. Add an **`AGENTS.md`** to the directory — the agent-facing build/run/layout
   contract (entrypoint, what the Dockerfile copies, where code/assets go, how to
   add deps + change the port, gotchas). Copy an existing template's as the shape.
   Exclude it from the build in `.dockerignore` (it matters for `static`, whose
   Dockerfile `COPY . `s the whole root; harmless elsewhere).
4. List the directory in the root `deploymill.json`.

### Don't bake the project's name into a template

`{{PROJECT_NAME}}` is substituted at **scaffold** time, so a template that uses
it renders differently for every project — and a template that renders
differently for every project has to be rebuilt for every project.

DeployMill builds each template **once**, centrally, and deploys that image for
the first deploy of any repo that is still the untouched scaffold. That only
works while the template's files are identical for everyone, so a template
should read `DM_PROJECT_NAME` at run time instead:

```js
const PROJECT_NAME = process.env.DM_PROJECT_NAME || "Your app";
```

```python
PROJECT_NAME = os.environ.get("DM_PROJECT_NAME") or "Your app"
```

Nothing breaks if you use `{{PROJECT_NAME}}` anyway — the template simply falls
back to being built per project, exactly as before. The eligibility check is
mechanical (DeployMill renders the template under two different project names and
compares the bytes), so there is no list to keep in sync.

The other thing that makes a template ineligible is a Dockerfile that copies the
**whole build context** (`COPY . …`, as `static` does). Such an image would also
bake in the per-repo files DeployMill and GitHub add — `.deploymill/project.json`,
the auto-init README — which differ per project. Copy named paths where you can.

Keep a **`runtime`** starter minimal — its goal is "first deploy green," not a
feature-rich app, and it's going to be replaced anyway. An **`app`** starter is
the opposite: it should be genuinely complete and useful on its first load,
because the user keeps it and edits from there. Every file in the directory
(except its `deploymill.json` manifest) is copied verbatim into the scaffolded
repo with `{{PROJECT_NAME}}` substituted — so `AGENTS.md` and any pointer
comments ride along automatically.

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
