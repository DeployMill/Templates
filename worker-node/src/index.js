// {{PROJECT_NAME}} — a deploymill *worker*.
//
// THE entrypoint: the Dockerfile runs `node src/index.js`. Edit this file (or
// import into it) to do real work; see AGENTS.md for the build/run contract.
//
// A long-running background process with no HTTP server and no port. deploymill
// keeps it running (it holds an active-app slot for as long as it's up). There's
// no domain and nothing to curl — its output is its stdout logs.
//
// Replace the heartbeat below with your real recurring work (poll a queue, run a
// periodic sweep, consume a stream, …). Keep the process alive: as long as the
// event loop has work (a timer, an open socket) Node won't exit.
const INTERVAL_MS = 30_000;

console.log(`[{{PROJECT_NAME}}] worker started at ${new Date().toISOString()}`);

let tick = 0;
async function doWork() {
  tick += 1;
  // TODO: replace this with the actual job.
  console.log(`[{{PROJECT_NAME}}] tick ${tick} @ ${new Date().toISOString()}`);
}

setInterval(() => {
  doWork().catch((err) => console.error(`[{{PROJECT_NAME}}] work failed:`, err));
}, INTERVAL_MS);

// Exit cleanly when the platform stops the container (deploy/redeploy/stop).
process.on("SIGTERM", () => {
  console.log(`[{{PROJECT_NAME}}] received SIGTERM, shutting down`);
  process.exit(0);
});
