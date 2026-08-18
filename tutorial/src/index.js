// This file is THE entrypoint — the Dockerfile runs `node src/index.js`. To
// change what the app does, edit (or import into) this file; a new file
// elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
//
// To change what the TUTORIAL SAYS, you almost certainly want src/content.js
// instead. See AGENTS.md for the full contract.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { renderPage } from "./views.js";
import { registerTickRoute } from "./tick.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Read the two static assets once at boot rather than per request. They're a few
// KB and they can't change without a redeploy, so a per-request disk read would
// buy nothing. A missing file is a build mistake worth failing loudly on, not
// something to paper over with an empty string.
const assets = {
  "/styles.css": {
    body: readFileSync(join(publicDir, "styles.css"), "utf8"),
    type: "text/css; charset=utf-8",
  },
  "/app.js": {
    body: readFileSync(join(publicDir, "app.js"), "utf8"),
    type: "text/javascript; charset=utf-8",
  },
  // The deploy-new-app skill, served raw. The page also SHOWS this file inline,
  // and both read the same bytes — so "copy it off the page" and "curl it" (or
  // point an agent at the URL) can never drift apart.
  "/deploy-new-app.md": {
    body: readFileSync(join(publicDir, "deploy-new-app.md"), "utf8"),
    type: "text/markdown; charset=utf-8",
  },
};

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

// The scheduled-jobs receiver. This app declares no schedules, so it's never
// ticked — the route is here so adding one is a code change, not a scavenger
// hunt. See src/tick.js.
registerTickRoute(app);

for (const [path, asset] of Object.entries(assets)) {
  app.get(path, (c) => c.body(asset.body, 200, { "content-type": asset.type }));
}

// The page renders any lesson `file` inline, so hand it the same already-read
// bodies the asset routes serve rather than reading them a second time.
const fileBodies = Object.fromEntries(
  Object.entries(assets).map(([path, asset]) => [path, asset.body])
);

app.get("/", (c) => c.html(renderPage(fileBodies)));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[tutorial] listening on :${info.port}`);
});
