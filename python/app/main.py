# This file is THE entrypoint — the Dockerfile runs `uvicorn app.main:app`, i.e.
# it serves the module-level `app` object below. To change what the app does,
# edit (or import into) this file and keep an `app` ASGI object; a new file
# elsewhere won't run unless the Dockerfile's COPY/CMD point at it.
# See AGENTS.md for the full build/run/layout contract.
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    return (
        "<!doctype html><title>{{PROJECT_NAME}}</title>"
        "<h1>{{PROJECT_NAME}}</h1>"
        "<p>FastAPI on Python, scaffolded by deploymill.</p>"
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
