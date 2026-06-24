// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
//
// The auth engine lives in src/auth.js (Better Auth) and the Postgres pool in
// src/db.js. See AGENTS.md for the full contract and the "make it yours" knobs:
// how to add a provider, add a protected route, and read the current user.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html } from "hono/html";
import { hasDatabase, withRetry } from "./db.js";
import { auth, enabledSocialProviders } from "./auth.js";

// --- Schema migration --------------------------------------------------------
// Better Auth owns its schema (user, session, account, verification). Rather than
// hand-write CREATE TABLE, we run Better Auth's own migration engine at boot —
// it diffs the live database and creates/alters only what's missing, so it's
// idempotent and safe to run on every start. This is the same thing the
// `@better-auth/cli migrate` command does, run in-process (no dev dep needed).
let ready = false;

async function loadGetMigrations() {
  // The export path has moved across Better Auth minors; probe both and use
  // whichever actually exports the function, so a version bump doesn't silently
  // break boot-time migration.
  for (const path of ["better-auth/db/migration", "better-auth/db"]) {
    try {
      const mod = await import(path);
      if (typeof mod.getMigrations === "function") return mod.getMigrations;
    } catch {
      // try the next path
    }
  }
  throw new Error("Better Auth getMigrations export not found (checked better-auth/db/migration and better-auth/db)");
}

async function initAuthSchema() {
  const getMigrations = await loadGetMigrations();
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  ready = true;
  console.log("[auth] schema ready");
}

// --- Views -------------------------------------------------------------------
const APP_TITLE = "{{PROJECT_NAME}}";

function layout(title, body) {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { --bg:#fafafa; --ink:#1f2937; --muted:#6b7280; --accent:#2563eb; --danger:#dc2626; --border:#e5e7eb; }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--ink); }
    header { padding:18px 24px; background:#fff; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
    header h1 { margin:0; font-size:18px; }
    header a { color:var(--accent); text-decoration:none; font-size:14px; }
    main { max-width:460px; margin:0 auto; padding:32px 24px; }
    .card { background:#fff; border:1px solid var(--border); border-radius:12px; padding:24px; }
    .card h2 { margin:0 0 6px; font-size:20px; }
    .card p.sub { margin:0 0 18px; color:var(--muted); font-size:14px; }
    label { display:block; font-size:13px; font-weight:600; margin:12px 0 4px; }
    input { font:inherit; width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; }
    button, .btn { font:inherit; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; border:0; border-radius:8px; padding:11px 14px; margin-top:16px; cursor:pointer; background:var(--accent); color:#fff; font-weight:600; text-decoration:none; }
    .btn.secondary { background:#f3f4f6; color:var(--ink); border:1px solid var(--border); }
    .muted { color:var(--muted); font-size:14px; }
    .switch { margin-top:18px; text-align:center; font-size:14px; }
    .switch a { color:var(--accent); text-decoration:none; }
    .error { background:#fef2f2; border:1px solid #fecaca; color:var(--danger); padding:10px 12px; border-radius:8px; font-size:14px; margin-bottom:16px; }
    .banner { padding:16px 20px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; }
    .divider { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:13px; margin:18px 0; }
    .divider::before, .divider::after { content:""; flex:1; height:1px; background:var(--border); }
    .social a { background:#fff; color:var(--ink); border:1px solid #d1d5db; margin-top:10px; }
    .kv { margin:0; padding:0; list-style:none; }
    .kv li { display:flex; justify-content:space-between; gap:16px; padding:9px 0; border-top:1px solid #f3f4f6; font-size:14px; }
    .kv li:first-child { border-top:0; }
    .kv .k { color:var(--muted); }
    .kv .v { font-weight:500; word-break:break-all; text-align:right; }
    form.inline { display:inline; margin:0; }
    form.inline button { width:auto; margin:0; padding:6px 12px; font-size:14px; background:#f3f4f6; color:var(--ink); border:1px solid var(--border); }
  </style>
</head>
<body>
  ${body}
  <!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge-->
</body>
</html>`;
}

function chrome(navRight, body) {
  return layout(
    APP_TITLE,
    html`<header><h1>${APP_TITLE}</h1><nav>${navRight}</nav></header><main>${body}</main>`
  );
}

const PROVIDER_LABEL = { github: "GitHub", google: "Google" };

function socialBlock() {
  if (enabledSocialProviders.length === 0) return "";
  const buttons = enabledSocialProviders
    .map(
      (p) =>
        html`<a class="btn" href="/auth/social/${p}">Continue with ${PROVIDER_LABEL[p] ?? p}</a>`
    )
    .reduce((acc, b) => html`${acc}${b}`, html``);
  return html`<div class="divider">or</div><div class="social">${buttons}</div>`;
}

function homePage(user) {
  if (user) {
    return chrome(
      html`<a href="/dashboard">Dashboard</a>`,
      html`<div class="card">
        <h2>You're signed in 👋</h2>
        <p class="sub">${user.email}</p>
        <a class="btn" href="/dashboard">Go to your protected dashboard</a>
        <form class="inline" method="post" action="/signout" style="display:block">
          <button class="btn secondary" type="submit">Sign out</button>
        </form>
      </div>`
    );
  }
  return chrome(
    html`<a href="/login">Log in</a>`,
    html`<div class="card">
      <h2>Welcome</h2>
      <p class="sub">This starter ships working email/password auth on managed
      Postgres — sign up, log in, and hit a protected route with zero auth code to write.</p>
      <a class="btn" href="/signup">Create an account</a>
      <a class="btn secondary" href="/login">Log in</a>
    </div>`
  );
}

function signupPage(error, values = {}) {
  return chrome(
    html`<a href="/login">Log in</a>`,
    html`<div class="card">
      <h2>Create your account</h2>
      <p class="sub">Email and a password — that's it.</p>
      ${error ? html`<div class="error">${error}</div>` : ""}
      <form method="post" action="/signup">
        <label for="name">Name</label>
        <input id="name" name="name" autocomplete="name" value="${values.name ?? ""}" placeholder="Ada Lovelace" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required value="${values.email ?? ""}" placeholder="you@example.com" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters" />
        <button type="submit">Sign up</button>
      </form>
      ${socialBlock()}
      <div class="switch">Already have an account? <a href="/login">Log in</a></div>
    </div>`
  );
}

function loginPage(error, values = {}) {
  return chrome(
    html`<a href="/signup">Sign up</a>`,
    html`<div class="card">
      <h2>Log in</h2>
      <p class="sub">Welcome back.</p>
      ${error ? html`<div class="error">${error}</div>` : ""}
      <form method="post" action="/login">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required value="${values.email ?? ""}" placeholder="you@example.com" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Your password" />
        <button type="submit">Log in</button>
      </form>
      ${socialBlock()}
      <div class="switch">No account yet? <a href="/signup">Sign up</a></div>
    </div>`
  );
}

function dashboardPage(user) {
  const created = user.createdAt ? new Date(user.createdAt).toLocaleString() : "—";
  return chrome(
    html`<a href="/">Home</a>`,
    html`<div class="card">
      <h2>Protected dashboard 🔒</h2>
      <p class="sub">Only a signed-in user reaches this route. The data below is your live session.</p>
      <ul class="kv">
        <li><span class="k">Name</span><span class="v">${user.name || "—"}</span></li>
        <li><span class="k">Email</span><span class="v">${user.email}</span></li>
        <li><span class="k">User ID</span><span class="v">${user.id}</span></li>
        <li><span class="k">Email verified</span><span class="v">${user.emailVerified ? "yes" : "no"}</span></li>
        <li><span class="k">Member since</span><span class="v">${created}</span></li>
      </ul>
      <form method="post" action="/signout">
        <button class="btn secondary" type="submit">Sign out</button>
      </form>
    </div>`
  );
}

// Build a redirect Response that also forwards Better Auth's Set-Cookie headers
// (the session cookie on sign-in, the cleared cookie on sign-out, the OAuth
// state cookie on a social redirect). We call the auth API server-side so the
// HTML forms work with no client-side JavaScript.
function redirectWithCookies(setCookies, location, status = 302) {
  const headers = new Headers({ Location: location });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(null, { status, headers });
}

function authErrorMessage(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

// --- App ---------------------------------------------------------------------
const app = new Hono();

// Liveness probe — pure liveness so a warming database on first boot never trips
// a false auto-rollback. Reports auth/db readiness for debugging, but always 200.
app.get("/healthz", (c) =>
  c.json({ ok: true, auth: hasDatabase ? (ready ? "ready" : "starting") : "no-database" })
);

// Gate every page on the database being provisioned and the schema migrated.
// Until then, render a friendly state instead of throwing.
app.use("*", async (c, next) => {
  if (c.req.path === "/healthz") return next();
  if (!hasDatabase || !auth) {
    return c.html(
      chrome(
        "",
        html`<div class="banner"><strong>No database provisioned yet.</strong>
        This app stores its users in managed Postgres. If you launched from the
        template it's already wired — give it a moment and refresh. Otherwise ask
        your agent to add a database (<code>reconcile_project</code>).</div>`
      )
    );
  }
  if (!ready) {
    return c.html(
      chrome("", html`<div class="banner">Starting up — the database is warming and
      auth tables are being created. Refresh in a few seconds.</div>`),
      503
    );
  }
  return next();
});

// Better Auth's own API surface: the OAuth callback the provider redirects to,
// plus the client SDK endpoints if you add a browser client. Keep this mounted.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return c.html(homePage(session?.user ?? null));
});

app.get("/signup", (c) => c.html(signupPage(null)));

app.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || email.split("@")[0];
  try {
    const { headers } = await auth.api.signUpEmail({
      body: { email, password, name },
      returnHeaders: true,
    });
    return redirectWithCookies(headers.getSetCookie(), "/dashboard");
  } catch (err) {
    return c.html(signupPage(authErrorMessage(err, "Could not create account."), { email, name }), 400);
  }
});

app.get("/login", (c) => c.html(loginPage(null)));

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    return redirectWithCookies(headers.getSetCookie(), "/dashboard");
  } catch (err) {
    return c.html(loginPage(authErrorMessage(err, "Invalid email or password."), { email }), 400);
  }
});

// Start a social login. Off-by-default: only enabled providers have a route that
// does anything; everything else bounces back to /login.
app.get("/auth/social/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!enabledSocialProviders.includes(provider)) return c.redirect("/login");
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: { provider, callbackURL: "/dashboard" },
      returnHeaders: true,
    });
    if (!response?.url) return c.redirect("/login");
    return redirectWithCookies(headers.getSetCookie(), response.url);
  } catch (err) {
    console.error("[auth] social sign-in failed:", authErrorMessage(err, "unknown"));
    return c.redirect("/login");
  }
});

// The protected example route. No session ⇒ bounce to login.
app.get("/dashboard", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/login");
  return c.html(dashboardPage(session.user));
});

app.post("/signout", async (c) => {
  try {
    const { headers } = await auth.api.signOut({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    return redirectWithCookies(headers.getSetCookie(), "/");
  } catch {
    return c.redirect("/");
  }
});

// --- Boot --------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Listening on :${port} (database ${hasDatabase ? "provisioned" : "not provisioned"})`);

if (hasDatabase && auth) {
  withRetry(initAuthSchema).catch((e) =>
    console.error("[auth] schema migration failed after retries:", e.message)
  );
}
