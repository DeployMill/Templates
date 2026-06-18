// Postgres, wired the way deploymill provisions it — read this before changing it.
//
// This template declares a managed Postgres database in its deploymill.json
// manifest, so `start_project` provisions one and injects the connection string
// as DATABASE_URL *before the first deploy*. Every supported Postgres provider
// (the house `deploymill` Postgres, Neon, Supabase) injects the SAME env var, so
// nothing here is provider-specific — you can switch providers later with zero
// code change.
//
// Cold-start tolerance: a freshly-provisioned database can take a moment to
// accept connections. So schema init runs in the BACKGROUND with retry (see
// index.js) and the server starts listening immediately — `/healthz` answers
// 200 right away so the deploy health-gate passes during warmup instead of
// rolling back a perfectly good build.
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL ?? "";

// True once a database is provisioned. Until then the app runs in a friendly
// "no database yet" mode (the home page explains how to add one) rather than
// crash-looping — handy while you watch an agent wire things up.
export const hasDatabase = connectionString.length > 0;

export const pool = hasDatabase
  ? new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 })
  : null;

// pg emits 'error' on idle clients (e.g. a backend restart). Without a listener
// that event is thrown and crashes the process — attach a no-op-ish handler.
pool?.on("error", (err) => console.error("[db] idle client error:", err.message));

/** Run a parameterized query. Throws if no database is provisioned yet. */
export async function query(text, params) {
  if (!pool) throw new Error("DATABASE_URL is not set — no database provisioned yet.");
  return pool.query(text, params);
}

/**
 * Retry `fn` a few times with a fixed delay. Used for boot-time schema init so a
 * database that's still accepting its first connections doesn't fail the deploy.
 */
export async function withRetry(fn, { tries = 10, delayMs = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[db] attempt ${attempt}/${tries} failed: ${err.message}`);
      if (attempt < tries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
