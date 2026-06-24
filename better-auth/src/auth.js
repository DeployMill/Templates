// Better Auth — the auth engine, wired against the app's own managed Postgres.
// See AGENTS.md for how to extend this (add a provider, add a protected route,
// read the current user). This file builds the `auth` instance; src/index.js
// mounts it and renders the sign-up / login / dashboard pages.
import crypto from "node:crypto";
import { betterAuth } from "better-auth";
import { pool, hasDatabase } from "./db.js";

// --- Signing key -------------------------------------------------------------
// Better Auth signs session cookies with this secret. Provide it per-app via the
// deploymill secret hand-off so the value never crosses the agent boundary or
// lands in the repo:
//
//   request_secret  → human pastes a random string in the browser
//   bind_secret     → exposes it to the app as the AUTH_SECRET env var
//
// (Generate one with: `openssl rand -base64 32`.) Until AUTH_SECRET is set the
// app still boots — it falls back to an EPHEMERAL key generated at startup, so
// auth works out of the box, but every restart invalidates existing sessions
// (everyone gets logged out). Set AUTH_SECRET for stable, persistent sessions.
const providedSecret = process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
const secret = providedSecret || crypto.randomBytes(32).toString("hex");
if (!providedSecret) {
  console.warn(
    "[auth] AUTH_SECRET is not set — using an ephemeral signing key. Sessions " +
      "reset on every restart. Set AUTH_SECRET via the deploymill secret hand-off " +
      "(request_secret + bind_secret) for stable sessions."
  );
}

// --- Social providers (OFF by default) ---------------------------------------
// Google and GitHub are wired but stay OFF until BOTH the client id and secret
// for a provider are present in the environment. To turn one on, hand off its
// two values and redeploy — no code change:
//
//   set_env_vars   GITHUB_CLIENT_ID   (the public client id is not sensitive)
//   bind_secret    GITHUB_CLIENT_SECRET   (via request_secret — never seen by the agent)
//   set_env_vars   BETTER_AUTH_URL=https://<your-app-domain>   (for the OAuth callback)
//
// The provider's callback URL is `${BETTER_AUTH_URL}/api/auth/callback/<provider>`
// — register that in the provider's console. See AGENTS.md → "Enable a social login".
const socialProviders = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

/** Provider keys that are actually enabled — drives which buttons render. */
export const enabledSocialProviders = Object.keys(socialProviders);

// `baseURL` is where the app is reachable. Behind deploymill's proxy Better Auth
// can infer it from the request, but OAuth callbacks need it explicit — set
// BETTER_AUTH_URL to your app's public URL once you enable a social provider.
const baseURL = process.env.BETTER_AUTH_URL || undefined;

// Only build the auth engine once a database exists. Before then `auth` is null
// and index.js renders the friendly "no database yet" page instead of crashing.
export const auth = hasDatabase
  ? betterAuth({
      database: pool,
      secret,
      baseURL,
      trustedOrigins: baseURL ? [baseURL] : undefined,
      emailAndPassword: {
        enabled: true,
        // No email server is wired in the starter, so don't gate login on a
        // verification email nobody can send. Add verification when you wire an
        // email provider — see AGENTS.md.
        requireEmailVerification: false,
      },
      socialProviders,
    })
  : null;
