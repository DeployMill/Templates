# Auth starter — how it builds, runs, and gets extended

> **Agent: read this before adding or moving files.** The `Dockerfile` decides
> what ships and what runs. Put code where it copies it, or change it to match.

**Stack:** Node 24 (Hono) + [Better Auth](https://www.better-auth.com/) + Postgres
· **Workload:** web · **Port:** 3000

Email/password sign-up, login, logout, and a protected route work **out of the
box on the first deploy** — no auth code to write. Auth lives in the app's own
code and the app's own managed Postgres; deploymill does **not** run a login
server for you.

## What actually runs

```
CMD ["node", "src/index.js"]
```

- `src/index.js` — **THE entrypoint.** Pages (`/`, `/signup`, `/login`,
  `/dashboard`), the form POST handlers, and the mounted Better Auth API
  (`/api/auth/*`). The protected route is `GET /dashboard`.
- `src/auth.js` — the Better Auth instance: email/password on, social providers
  wired but off, signing key, database.
- `src/db.js` — the Postgres pool (`DATABASE_URL`) handed to Better Auth.

Anything outside `src/` and `public/` is **not** in the image.

## The database (already wired)

`deploymill.json` declares a managed Postgres database, so `start_project`
provisions it and injects **`DATABASE_URL`** before the first deploy. Better
Auth's tables — `user`, `session`, `account`, `verification` — are created in
**this app's own database**, never deploymill's control-plane DB.

- **Migrations:** on boot, `src/index.js` runs Better Auth's own migration engine
  (`getMigrations(auth.options).runMigrations()`) in the background with retry. It
  diffs the live DB and creates only what's missing, so it's idempotent — safe on
  every start. After you change auth config (add a plugin, a user field), it picks
  up the new tables/columns on the next deploy.
- **Health:** `GET /healthz` is **liveness only** so a warming DB never trips a
  false auto-rollback. Pages show a "starting" state until migration finishes.

## The signing key (`AUTH_SECRET`)

Better Auth signs session cookies with `AUTH_SECRET`. Provide it per-app via the
**secret hand-off** so the value never crosses the agent boundary or the repo:

```
request_secret   → human pastes a random string (e.g. `openssl rand -base64 32`)
bind_secret      → exposes it to the app as AUTH_SECRET
```

Until it's set the app still boots on an **ephemeral** key (auth works), but every
restart logs everyone out. Set `AUTH_SECRET` for stable sessions.

## Enable a social login (Google / GitHub) — a secret-hand-off step

Both are wired in `src/auth.js` but stay **off** until their two values are
present. To turn one on, **no code change** — hand off the credentials and set the
app URL, then redeploy:

```
set_env_vars   GITHUB_CLIENT_ID=<public client id>      # not sensitive
request_secret + bind_secret  GITHUB_CLIENT_SECRET       # never seen by the agent
set_env_vars   BETTER_AUTH_URL=https://<your-app-domain> # for the OAuth callback
```

Register the callback URL **`${BETTER_AUTH_URL}/api/auth/callback/github`** in the
provider's console (same shape for `google`). Once both id+secret are set, a
"Continue with GitHub" button appears on the login/sign-up pages automatically.

## Make it yours (remix knobs)

- **Read the current user** anywhere:
  ```js
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  // session?.user  → null when logged out
  ```
- **Add a protected route** — copy the `/dashboard` guard:
  ```js
  app.get("/secret", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.redirect("/login");
    return c.html(/* ...your page, session.user available... */);
  });
  ```
- **Add a field to users** (e.g. a role) — add it under `user.additionalFields`
  in the `betterAuth({...})` config in `src/auth.js`; the boot migration creates
  the column on next deploy. (See `better-auth` docs → *Concepts → Database*.)
- **Restyle** — the CSS variables live in `layout()` in `src/index.js`.

## Upgrade prompts (paid envelope — not free-tier)

- **Email verification / password reset** → wire an email provider (bind its
  secret) and set `emailAndPassword.requireEmailVerification` / `sendResetPassword`
  in `src/auth.js`. Sending email needs **open egress** (paid tier).
- **Social login** → needs open egress to reach the provider's OAuth endpoints.

## Constraints (free tier)

State **only** in managed Postgres: no volumes, no uploads. Email/password auth
works fully offline; **social login and email need open egress** (paid). Deps:
`hono`, `@hono/node-server`, `better-auth`, `pg` (all pure-JS — no native build).
Listen on `0.0.0.0:$PORT`; keep `/healthz` fast and 200.

## File map

```
your-app/
├── Dockerfile          # build + run contract
├── package.json        # deps: hono, @hono/node-server, better-auth, pg
├── src/
│   ├── index.js        # ← ENTRYPOINT: pages, form handlers, /api/auth/* mount
│   ├── auth.js         # Better Auth instance (providers, secret, database)
│   └── db.js           # Postgres pool + retry helper
├── public/             # static assets (copied into the image)
└── AGENTS.md           # this file
```
