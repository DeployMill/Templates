"""{{PROJECT_NAME}} — a deploymill *worker*.

THE entrypoint: the Dockerfile runs `python -m app.main` (calls main() below).
Edit this file (or import into it) to do real work; see AGENTS.md for the
build/run contract.

A long-running background process: no HTTP server, no port, no domain. deploymill
keeps it running (it holds an active-app slot for as long as it's up). Its output
is its stdout logs — there's nothing to curl.

Replace the heartbeat below with your real recurring work (poll a queue, run a
periodic sweep, consume a stream, ...).
"""

import signal
import sys
import time
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    print(f"[{{PROJECT_NAME}}] worker started at {_now()}", flush=True)

    def _shutdown(*_args):
        print(f"[{{PROJECT_NAME}}] received SIGTERM, shutting down", flush=True)
        sys.exit(0)

    # Exit cleanly when the platform stops the container (deploy/redeploy/stop).
    signal.signal(signal.SIGTERM, _shutdown)

    tick = 0
    while True:
        tick += 1
        # TODO: replace this with the actual job.
        print(f"[{{PROJECT_NAME}}] tick {tick} @ {_now()}", flush=True)
        time.sleep(30)


if __name__ == "__main__":
    main()
