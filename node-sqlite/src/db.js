// SQLite, wired the way deploymill provisions it — read this before changing it.
//
// When you provision a sqlite database (`"database": { "provider": "sqlite" }`
// in .deploymill/project.json, then reconcile + deploy), deploymill:
//   1. auto-provisions a persistent volume, and
//   2. injects DATABASE_URL=file:<path>.db pointing at a file ON that volume.
// Opening that path is what makes the data survive restarts and redeploys.
//
// Until a database is provisioned, DATABASE_URL is unset. The container
// filesystem is read-only (only mounted volumes are writable), so opening a
// file on it would crash-loop the first deploy. So with no DATABASE_URL we fall
// back to an in-memory database: the app still boots green, but the data is
// EPHEMERAL and resets on every restart. Do NOT treat :memory: as the
// destination — it's only the pre-provision placeholder. Provision sqlite to
// persist.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

// Turn the injected DATABASE_URL into an on-disk path. deploymill injects the
// Prisma-style `file:<path>` form; we also accept `file://` URLs for safety.
function resolveDbPath(url) {
  if (!url) return null; // no database provisioned yet → caller uses :memory:
  if (url.startsWith("file://")) return fileURLToPath(url);
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url; // already a bare path
}

const dbPath = resolveDbPath(process.env.DATABASE_URL);

// `persistent` lets the app surface, honestly, whether this run survives a
// restart — handy for a "does SQLite actually persist?" smoke test.
export const persistent = dbPath !== null;

if (persistent) {
  // The volume's mountPath exists, but the .db file may sit in a subdirectory of
  // it; create the parent so the very first open doesn't fail. Best-effort: a
  // read-only path throws here, which is a clearer signal than a later open.
  mkdirSync(dirname(dbPath), { recursive: true });
}

export const db = new DatabaseSync(persistent ? dbPath : ":memory:");

// WAL keeps reads from blocking on writes and survives the volume; harmless and
// a no-op for :memory:.
db.exec("PRAGMA journal_mode = WAL;");
