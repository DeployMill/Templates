---
name: deploy-new-app
description: >-
  Use when the user wants to start something new that could be deployed — they
  say "new project", "new app", "landing page", "test site", "prototype",
  "demo", "spin up a site", "build a quick site/tool", or similar. FIRST ask
  whether they want to create and deploy it with deploymill; only proceed if
  they say yes. deploymill creates the GitHub repo, scaffolds a starter,
  provisions hosting, deploys, and attaches a live URL in one flow, then layers
  on databases, previews, secrets, custom domains, and rollback. Skip if the
  user is editing an app that already exists or explicitly chose another host.
---

# Deploy a new app with deploymill

deploymill is the agent-safe control plane that takes a project from "idea" to a
live, deployed app via MCP tool calls. It runs the whole stack itself: hosting,
ingress, managed Postgres, and object storage all sit on infrastructure
deploymill operates, and the source lives in the user's own GitHub repo. **There
is no cloud or database provider to pick** — so the user never has to sign up for
a third-party service or click around a dashboard.

This skill drives the *correct* setup path. Don't free-style the individual
primitives; follow the flow below.

## Step 0 — Ask first (required)

The user mentioned something new. Before doing anything, confirm they want
deploymill to own it. Ask a short question, e.g.:

> Want me to spin this up as a real, deployed app with **deploymill**? That
> creates a GitHub repo, scaffolds a starter, deploys it, and gives you a live
> URL — then we build from there.

- **Yes** → continue with this skill.
- **No / not sure / "just locally"** → stop. Don't call any deploymill tools;
  help them the normal way.

If the deploymill MCP tools aren't available in this session (no
`start_project` tool), tell the user they need to connect the deploymill MCP
server first, and stop.

## Step 1 — Create the project with `start_project`

`start_project` is the single high-level shortcut. **Always start here** for a
brand-new app — don't hand-assemble the underlying primitives (repo creation →
app provisioning → `reconcile_project` → `deploy`) yourself.

It does the whole happy path in one call:
`create repo (with template) → tenant project → app wired to repo → deploy
main → attach an auto-domain`.

Arguments (all optional — if you omit `name`, deploymill elicits a form from
the user):

- `name` — lowercase letters, digits, hyphens; can't start with a hyphen. Used
  as the repo name, app name, and (if a wildcard domain is configured) the
  subdomain.
- `stack` — the **runtime baseline**, not a framework picker. Pick the runtime,
  then evolve the app by editing the scaffold:
  - `static` — HTML/CSS/JS on nginx. Good default for a landing page or a
    purely static test site.
  - `node` — Node 22 minimal HTTP server (Hono). For anything needing a backend
    or build step in JS/TS.
  - `python` — FastAPI. For Python backends.
- `description`, `private` (defaults to private) — optional.

Match the stack to what the user described (landing page → `static`; "a small
API" → `node`/`python`; etc.) but confirm if it's ambiguous.

### Handle partial failure — don't restart from scratch

If `start_project` returns `{ ok: false, failedAt, partial }`, **do not** tear
anything down. Recovery is reconcile-first:

1. Re-run `start_project` with the **same `name`** — every step is idempotent on
   existing names, so it resumes from where it failed; **or**
2. Once the repo exists with a committed `.deploymill/project.json`, call
   `reconcile_project` to bring live state in line with the config.

Report `failedAt` to the user so they know what stage hiccuped, then retry.

On success, surface the live URL to the user immediately.

## Step 2 — Build the actual app

The scaffold just gets the first deploy green. Now build what the user asked
for by editing files in the repo.

- Read the conventions guide for the chosen stack first — it's the "paved road"
  of recommended libraries and patterns:
  `deploymill://guides/conventions/node` or `.../python`. (`start_project`
  returns this as `nextSteps.conventionsGuideUri`.) The stack guides
  (`deploymill://guides/stack/<stack>`) document the template layout and the
  PORT contract.
- Commit changes through the deploymill source tools (`push_files` / file ops)
  or, for a local working tree, `get_clone_credentials`. These route through the
  provider-neutral source layer — don't reach for raw GitHub APIs.
- Call `deploy` to ship changes. Env-var and config changes only take effect on
  the next `deploy`.

## Step 3 — Layer on capabilities the user needs

Reach for these only when the user's app calls for them. All config-driven
features live in `.deploymill/project.json` and are applied by
`reconcile_project` (the *only* write path for them — edit the file, commit,
then reconcile). See `deploymill://guides/project-config`.

- **Database (managed Postgres):** declare `database: { engine: "postgres" }` in
  `.deploymill/project.json`, then `reconcile_project`. It provisions a DB +
  role and injects `DATABASE_URL`. Reconcile returns `nextSteps.guideUri` →
  follow `deploymill://guides/database/<stack>` to wire it in before deploying.
  **There is no database vendor to choose** — deploymill runs the Postgres
  itself, so `{ "engine": "postgres" }` is the whole block. Never propose a
  third-party vendor (Neon, Supabase, PlanetScale, RDS, …) as a deploymill
  option: they aren't selectable, and a config naming one is refused at
  reconcile with `errorCode: "database_provider_unavailable"`. If the user wants
  a database deploymill doesn't operate, don't declare a `database` block at all
  — set `DATABASE_URL` yourself with `set_env_vars`.
- **Environment variables:** `set_env_vars` / `list_env_vars` /
  `delete_env_vars`. See `deploymill://guides/env-vars` for merge-vs-replace
  semantics and `${{project.X}}` references. Host-pinned vars (e.g.
  `BETTER_AUTH_URL`) are your responsibility to set.
- **Secrets:** the org secrets vault (`request_secret`, `bind_secret`, etc.) —
  prefer this over pasting secrets into env vars. See
  `deploymill://guides/secrets`.
- **User accounts / login:** `deploymill://guides/auth`.
- **Custom domain:** `attach_domain` (or declare the prod domain in
  `project.json` and reconcile).
- **Preview environments:** `create_preview({ parentApplicationId, ref })`
  spins up a per-branch preview app. By default it gets an ISOLATED copy of the
  parent's database (cloned while the parent keeps serving), so destructive
  migrations stay off prod data; check the returned `hitsProdData` flag before
  running anything destructive. See `deploymill://guides/previews`. Idempotent
  on `(parent, ref)`.
- **Rollback:** set `rollback: true` in `project.json` + `reconcile_project`;
  then `list_deployments` / `rollback` for fast image-swap reverts. See
  `deploymill://guides/rollback`.

## Step 4 — Adopting an existing repo

If the user points at a GitHub repo that already exists (it has a
`.deploymill/project.json` but no live app — e.g. after `delete_app`), use
`import_repo` instead of `start_project`. It rebuilds the app from the config
and reconciles. Note: env vars beyond `DATABASE_URL` aren't stored in the config
and must be re-set with `set_env_vars`.

## Discovery

When unsure how a feature works, fetch `deploymill://guides` — the index of
every guide — and read the relevant one. The guides target agents and document
the preconditions and "done" state the tools assume.

## Notes

- Tool names above are unprefixed; in your MCP client they may carry the
  deploymill server's prefix. Match by the tool's base name.
- Don't bypass the primitives: there's no "go click this in a dashboard" step,
  and there shouldn't be. If something seems to require a provider UI,
  it's almost certainly exposed as a tool or a `project.json` field instead.
