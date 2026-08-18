// POST /_system/tick — the scheduled-jobs receiver every DeployMill web app
// ships. When your app declares schedules in .deploymill/project.json (e.g.
//   "schedules": [{ "name": "daily-digest", "cron": "0 8 * * *" }]
// ), deploymill registers the cron and, on a due minute, POSTs this endpoint
// with `Authorization: Bearer <DM_SCHEDULE_TICK_SECRET>` (an env var deploymill
// injects automatically) and a JSON body { job, scheduledTime }.
//
// Ticks are AT-LEAST-ONCE, so handlers must be idempotent — write them as "do
// the work for whoever is due", not "fire exactly once".
//
// This tutorial declares no schedules, so it is never ticked. The route is here
// so that "add a scheduled job" is a lesson you can actually do: declare a
// schedule, add a handler below, deploy.
// See deploymill://guides/schedules for the full contract.

import { timingSafeEqual } from "node:crypto";

const TICK_SECRET = process.env.DM_SCHEDULE_TICK_SECRET ?? "";

function tokenOk(header) {
  if (!TICK_SECRET || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(TICK_SECRET);
  // Length guard is required: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

// Register scheduled handlers here, keyed by the schedule `name` from
// .deploymill/project.json. An app with no schedules is never ticked; an unknown
// job returns 404 — that's the "you declared a schedule but didn't add its
// handler" signal.
const handlers = {
  // "daily-digest": async () => { /* ... */ },
};

/** Mount the tick receiver on a Hono app. */
export function registerTickRoute(app) {
  app.post("/_system/tick", async (c) => {
    if (!tokenOk(c.req.header("authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const { job } = await c.req.json();
    const handler = handlers[job];
    if (!handler) return c.json({ error: "unknown_job", job }, 404);
    await handler();
    return c.json({ ok: true, job });
  });
}
