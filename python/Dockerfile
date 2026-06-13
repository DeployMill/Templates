FROM python:3.13-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS build
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

FROM base AS runtime
COPY --from=build /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY app ./app
# Run as a non-root user — the platform drops all Linux capabilities (only
# NET_BIND_SERVICE is re-added), so don't rely on root. uvicorn binds :8000
# (an unprivileged port) and the app is read-only, so a plain user suffices.
RUN useradd --create-home --uid 1000 appuser
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
