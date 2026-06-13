# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs.

**Stack:** static (nginx) · **Workload:** web · **Port:** 8080 · **No runtime,
no build step** — just static assets.

## What actually runs

There is no app process and no `CMD` to edit — `nginx` serves files. The
`Dockerfile` copies the **entire repo root** into nginx's document root:

```
COPY . /usr/share/nginx/html/
```

So **every file at the repo root is served as-is.** `index.html` is served at
`/`, `app.js` at `/app.js`, `styles/main.css` at `/styles/main.css`, etc.

## Where files go

- **Put every asset you want served at the repo ROOT** — `index.html`, JS, CSS,
  images. **Not** in a `public/` or `src/` subdirectory: a file at `public/app.js`
  is served at `/public/app.js` (not `/app.js`), which is almost never what you
  want.
- Build/meta files (`Dockerfile`, `.git`, `AGENTS.md`, `.dockerignore`) are kept
  out of the served image by `.dockerignore` — keep that exclusion list current
  if you add files that shouldn't be public.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # serves the repo root via nginx; edit only to change the port
├── index.html          # ← served at /  (your homepage)
├── (your-asset.js)     # served at /your-asset.js — put assets at the ROOT
├── AGENTS.md           # this file (excluded from the image via .dockerignore)
├── .dockerignore       # what NOT to serve
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform); port lives here too
```

## Recipes

- **Add a page or asset** → drop the file at the repo root. That's it — it's
  served immediately on the next deploy.
- **Change the port** → keep `EXPOSE` (Dockerfile) and `port`
  (`.deploymill/project.json`) in sync. The image is `nginx-unprivileged`, which
  listens on **8080** by default (it runs non-root and can't bind low ports).
- **Health check** → no `/healthz` is required; the platform's probe falls back
  to `GET /`, which nginx serves from `index.html`.

## Gotchas

- **This template does NOT build anything.** If your project needs a build step
  (Vite, a React/Svelte bundle, Tailwind), this static template won't run it —
  either commit the already-built output at the repo root, or add a multi-stage
  Dockerfile (a `node` build stage that emits `dist/`, then copy `dist/` into
  nginx). A raw `src/` of un-bundled framework code will be served verbatim, not
  compiled.
- Runs as the non-root nginx user with Linux capabilities dropped — that's why
  it's the `nginx-unprivileged` image, not stock `nginx` (which `chown`s at
  startup and would crash here).
