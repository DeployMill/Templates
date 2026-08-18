# {{PROJECT_NAME}} — the DeployMill tutorial app (how it builds, runs, and gets remixed)

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.

**Stack:** Node 24 (Hono) · **Workload:** web · **Port:** 3000 · **No database**

## What this app is for

This is the interactive onboarding tutorial DeployMill provisions into a new
workspace. It teaches the platform by *being* an app the user changes — connect
an MCP client, install the skill, then run previews, logs, rollback, env vars and
backups against this very site.

So when the user asks you to change it, **change it**. A broken tutorial they
fixed themselves teaches more than a pristine one they didn't touch. The only
thing worth protecting is that it stays deployable.

## What actually runs

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — it serves the page and the two static
assets. Anything outside `src/` and `public/` is **not** in the image.

| File | What it's for |
|---|---|
| `src/content.js` | **The lessons.** Titles, body copy, agent prompts, notes. Edit this to change what the tutorial says. |
| `src/clients.js` | Per-MCP-client connection snippets (Claude Code, Cursor, VS Code…). Add a client here. |
| `src/config.js` | Reads the injected env vars (MCP URL, workspace slug, expiry date). |
| `src/views.js` | HTML rendering. Edit for how it *looks*, not what it *says*. |
| `src/index.js` | Server + routes. |
| `src/tick.js` | The `POST /_system/tick` scheduled-jobs receiver. No schedules declared, so it never fires — add one and register a handler here. |
| `public/styles.css` | All styling. Light + dark come from the same tokens at the top. |
| `public/app.js` | Copy buttons, client tabs, and the "done" checkmarks (localStorage only). |
| `public/deploy-new-app.md` | The DeployMill skill, shown in full in the setup lesson AND served raw at `/deploy-new-app.md`. Both read the same bytes, so the page and the URL can't drift. |

**Changing the tutorial's words is almost always `src/content.js`.** A lesson is a
plain object — `{ id, title, body[], prompt?, file?, note? }` — and the page
rebuilds itself from the array, so adding, removing or rewriting a lesson needs
no change to the rendering code.

A lesson's optional `file` shows a whole file on the page, collapsed, with a copy
button and a link to its raw URL: `{ name, path, description }`. `path` must be a
file in `public/` that `src/index.js` also serves, so the bytes on the page and
the bytes at the URL are the same read. That's how the skill lesson works — the
user can copy it, curl it, or point their agent at the URL, and none of those can
disagree with each other.

`id` is the localStorage key for that lesson's checkmark. Renaming an `id` resets
whether the user had ticked it; that's fine, just don't be surprised by it.

## Injected environment

DeployMill sets these when it provisions the app. They are **public workspace
config, not secrets** — the user can read this repo.

| Var | What it is |
|---|---|
| `DEPLOYMILL_MCP_URL` | The MCP endpoint the setup lesson tells the user to connect to. |
| `DEPLOYMILL_DASHBOARD_URL` | Link back to the account dashboard. |
| `DEPLOYMILL_DOCS_URL` | Link to the docs. |
| `DEPLOYMILL_ORG_SLUG` | The workspace slug, shown in the header. |
| `DEPLOYMILL_TUTORIAL_EXPIRES_AT` | When the free window closes; drives the banner countdown. |
| `TUTORIAL_GREETING` | Optional, **set by the user** in the env-vars lesson. Renders under the intro. |

`src/config.js` has a sensible fallback for every one, so the app still runs with
none of them set.

## This app is on a clock

It is exempt from the workspace's app quota and compute pool for a bounded window
(`DEPLOYMILL_TUTORIAL_EXPIRES_AT`), after which the user either keeps it — making
it a normal, quota-counted app — or it's deleted. The banner says so.

**Don't remove that banner**, and don't rewrite it to imply the app is permanent.
If the user asks to keep the app, that's an action in the dashboard (or the
`/api/ui/tutorial-app/keep` endpoint), not a code change here.

## Adding dependencies

Runtime deps go in `dependencies` — the Dockerfile installs with `--prod` and
copies that `node_modules` straight into the image, so a `devDependency` won't be
there at run time. There's no build step.

## Health

`GET /healthz` returns `{"ok":true}` — liveness only. It has no dependencies to
check, which is the point: this app has no database and no external calls, so it
boots fast and sleeps cheap.

## No database, on purpose

The tutorial keeps no server-side state (progress lives in the reader's browser),
so it starts instantly and draws almost nothing while idle. **Adding a database
is one of the lessons** — if the user asks, do it properly: declare it in
`.deploymill/project.json`, run `reconcile_project`, and read `DATABASE_URL`.
Don't add a file-backed store instead; the free tier has no persistent volume.
