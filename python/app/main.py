# This file is THE entrypoint — the Dockerfile runs `uvicorn app.main:app`, i.e.
# it serves the module-level `app` object below. To change what the app does,
# edit (or import into) this file and keep an `app` ASGI object; a new file
# elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
# See AGENTS.md for the full build/run/layout contract.
import hmac
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    return (
        "<!doctype html><title>{{PROJECT_NAME}}</title>"
        "<h1>{{PROJECT_NAME}}</h1>"
        "<p>FastAPI on Python, scaffolded by deploymill.</p>"
        '<!--deploymill:badge--><a href="https://deploymill.com?utm_source=deploymill-badge&utm_medium=app" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf6;background:rgba(11,18,32,.88);border:1px solid rgba(255,255,255,.14);border-radius:9px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">⚡ Built on deploymill</a><!--/deploymill:badge-->'
    )


# Health endpoint — deploymill's canonical "is this deploy good?" signal.
# deploy / rollback / get_app_health and auto-rollback all probe this path and
# treat 200 as the ONLY healthy response: anything else (a 500, a raised
# exception, a timeout) means the deploy is bad and an auto-rollback-armed app
# reverts. Put your REAL readiness checks here and return 200 only when they all
# pass — e.g. uncomment to fail the gate when the database is unreachable:
#
#   from fastapi import Response
#
#   @app.get("/healthz")
#   def healthz(response: Response) -> dict:
#       try:
#           engine.connect().close()        # DB reachable + migrations ran?
#           return {"ok": True}
#       except Exception:
#           response.status_code = 503       # not ready → deploy stays on the old image
#           return {"ok": False}
@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


# --- Scheduled-jobs receiver -------------------------------------------------
# POST /_system/tick is where deploymill delivers scheduled "ticks". When your
# app declares schedules in .deploymill/project.json (e.g.
#   "schedules": [{ "name": "daily-digest", "cron": "0 8 * * *" }]
# ), deploymill registers the cron and, on a due minute, POSTs this endpoint
# with `Authorization: Bearer <DM_SCHEDULE_TICK_SECRET>` (an env var deploymill
# injects automatically) and a JSON body { job, scheduledTime }. Ticks are
# at-least-once, so handlers MUST be idempotent — "do the work for whoever is
# DUE", not "fire exactly once".
# See deploymill's deploymill://guides/schedules for the full contract.

TICK_SECRET = os.environ.get("DM_SCHEDULE_TICK_SECRET", "")


def _token_ok(header: str | None) -> bool:
    if not TICK_SECRET or not header or not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[7:], TICK_SECRET)


# Register scheduled handlers keyed by the schedule `name` from
# .deploymill/project.json. Handlers MUST be idempotent (a tick can fire more
# than once). An app with no schedules is never ticked; an unknown job returns
# 404 — that's the "you declared a schedule but didn't add its handler" signal.
HANDLERS = {
    # "daily-digest": daily_digest,
}


@app.post("/_system/tick")
async def system_tick(request: Request) -> dict:
    if not _token_ok(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="unauthorized")
    body = await request.json()
    job = body.get("job")
    handler = HANDLERS.get(job)
    if handler is None:
        raise HTTPException(status_code=404, detail="unknown_job")
    await handler()
    return {"ok": True, "job": job}
