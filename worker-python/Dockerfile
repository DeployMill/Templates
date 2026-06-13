FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Stdlib-only worker — no dependency install step. When you add libraries,
# declare them in pyproject.toml and switch to a uv-based build (see the web
# python template) before the import here.
COPY app ./app

# Run as a non-root user — the platform drops all Linux capabilities, so don't
# rely on root. The worker only reads its own code, so a plain user suffices.
RUN useradd --create-home --uid 1000 appuser
USER appuser

# No EXPOSE — this is a background worker, not an HTTP service.
CMD ["python", "-m", "app.main"]
