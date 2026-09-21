# QuickSell backend — FastAPI + Uvicorn
#
# Build:  docker build -t quickstore-backend ./backend
# Run:    docker run -p 8000:8000 \
#           -e MONGO_URL=mongodb://host.docker.internal:27017 \
#           -e JWT_SECRET=$(python -c 'import secrets;print(secrets.token_urlsafe(48))') \
#           -v quickstore-media:/data/media \
#           quickstore-backend
#
# Runs on anything that runs a container: Docker, Compose, Kubernetes, ECS/Fargate,
# Cloud Run, Render, Fly.io, Railway, Azure Container Apps.

FROM python:3.11-slim AS base

# - PYTHONUNBUFFERED so logs reach the container runtime immediately
# - PYTHONDONTWRITEBYTECODE to keep the image and read-only filesystems clean
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# curl is used by the container HEALTHCHECK below. Build-time compilers are not
# needed: every dependency ships manylinux wheels for this platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first, so editing application code does not invalidate this layer.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# Run as a non-root user. /data/media is the default mount point for uploaded
# images when STORAGE_BACKEND=local; it must be writable by that user.
RUN useradd --create-home --uid 10001 app \
 && mkdir -p /data/media \
 && chown -R app:app /app /data/media
USER app

ENV APP_ENV=production \
    MEDIA_ROOT=/data/media \
    PORT=8000

# Declared so `docker run -v` without a named volume still gets a real mount, and
# as documentation of what needs to persist across restarts.
VOLUME ["/data/media"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

# One Uvicorn worker per container; scale by running more containers, which is how
# every orchestrator expects to scale. Raise WEB_CONCURRENCY if you would rather
# scale inside one container.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY:-1} --proxy-headers --forwarded-allow-ips='*'"]
