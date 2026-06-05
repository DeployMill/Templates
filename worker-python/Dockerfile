FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Stdlib-only worker — no dependency install step. When you add libraries,
# declare them in pyproject.toml and switch to a uv-based build (see the web
# python template) before the import here.
COPY app ./app

# No EXPOSE — this is a background worker, not an HTTP service.
CMD ["python", "-m", "app.main"]
