// Everything the tutorial knows about YOUR workspace, read from the environment
// at boot. DeployMill sets these when it provisions the app; the fallbacks keep
// the page sensible if you run it locally or clear a variable.
//
// None of these are secrets. They're public workspace config — the MCP endpoint,
// your workspace slug, links back to the dashboard. A real credential would go
// through the secrets flow instead (see the "env vars and secrets" lesson).

function env(name, fallback) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  /** The MCP endpoint your agent connects to. The one value the whole setup
   *  flow hangs on, which is why it's injected rather than hardcoded. */
  mcpUrl: env("DEPLOYMILL_MCP_URL", "https://deploymill.com/mcp"),
  dashboardUrl: env("DEPLOYMILL_DASHBOARD_URL", "https://deploymill.com/account"),
  docsUrl: env("DEPLOYMILL_DOCS_URL", "https://deploymill.com/docs"),
  orgSlug: env("DEPLOYMILL_ORG_SLUG", null),
  appName: env("DEPLOYMILL_APP_NAME", "deploymill-tutorial"),
  /** When this app's free window closes, ISO-8601. Null when it isn't on one
   *  (you kept the app, or you're running this yourself). */
  expiresAt: env("DEPLOYMILL_TUTORIAL_EXPIRES_AT", null),
  /** Set this yourself in the env-vars lesson and it shows up on the page. */
  greeting: env("TUTORIAL_GREETING", null),
};

/** Whole days until the free window closes, or null when there's no window.
 *  Rounded up, so a part-day still reads as a day rather than zero. */
export function daysUntilExpiry(now = new Date()) {
  if (!config.expiresAt) return null;
  const until = Date.parse(config.expiresAt);
  if (!Number.isFinite(until)) return null;
  const ms = until - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
