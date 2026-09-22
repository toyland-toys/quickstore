"""
Runtime configuration for the QuickSell backend.

Everything is read from environment variables (optionally via a .env file next to
this module). Nothing here is tied to a particular hosting provider: the same
code runs on a laptop, a VPS, Docker/Compose, Kubernetes, Render, Fly.io, ECS,
Railway, or anywhere else that can set env vars and run a Python process.

See .env.example for the full list with explanations.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent

# A .env file is a convenience for local development. In a container or on a PaaS
# you normally set real environment variables instead; those always win, because
# load_dotenv() does not override anything already present in the environment.
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("quicksell.config")


class ConfigError(RuntimeError):
    """Raised when the environment is missing something the app cannot run without."""


def _str(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _bool(name: str, default: bool = False) -> bool:
    raw = _str(name)
    if not raw:
        return default
    return raw.lower() in ("1", "true", "yes", "y", "on")


def _int(name: str, default: int) -> int:
    raw = _str(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer, got {raw!r}")


def _list(name: str, default: str = "") -> list[str]:
    raw = _str(name, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


# --------------------------------------------------------------------------
# Environment
# --------------------------------------------------------------------------
# "development" relaxes a few checks so the app boots with zero configuration.
# Set APP_ENV=production on any real deployment.
APP_ENV = _str("APP_ENV", "development").lower()
IS_PRODUCTION = APP_ENV in ("production", "prod")

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
# Any MongoDB works: a local mongod, Docker, MongoDB Atlas, DocumentDB, or a
# self-hosted replica set. Just point MONGO_URL at it.
MONGO_URL = _str("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = _str("DB_NAME", "quicksell")

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
_DEV_JWT_SECRET = "insecure-development-secret-change-me"
# Resolved at import time so callers can safely do `from config import JWT_SECRET`.
# A missing secret is tolerated outside production (validate() warns about it) and
# is a hard error in production (validate() raises).
JWT_SECRET_WAS_UNSET = not _str("JWT_SECRET")
JWT_SECRET = _str("JWT_SECRET") or _DEV_JWT_SECRET
JWT_EXP_DAYS = _int("JWT_EXP_DAYS", 30)
DEV_OTP_CODE = _str("DEV_OTP_CODE", "123456")

# --------------------------------------------------------------------------
# SMS OTP delivery (Twilio)
# --------------------------------------------------------------------------
# Only consulted when the admin panel's otp_provider is switched to "twilio"
# (stored in the DB, not here -- see server.py's /admin/settings). That switch
# is itself rejected if these are unset, so the app never silently falls back
# to a broken SMS path. TWILIO_MESSAGING_SERVICE_SID and TWILIO_FROM_NUMBER
# are two ways to say the same thing (a Messaging Service simplifies sender
# selection/scaling; a bare from-number works just as well for a single
# number) -- set whichever one your Twilio setup uses.
TWILIO_ACCOUNT_SID = _str("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = _str("TWILIO_AUTH_TOKEN")
TWILIO_MESSAGING_SERVICE_SID = _str("TWILIO_MESSAGING_SERVICE_SID")
TWILIO_FROM_NUMBER = _str("TWILIO_FROM_NUMBER")
TWILIO_CONFIGURED = bool(
    TWILIO_ACCOUNT_SID
    and TWILIO_AUTH_TOKEN
    and (TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)
)

# How long a sent OTP code stays valid, and how many wrong guesses are allowed
# before it's invalidated outright (forcing a fresh code) -- both apply only to
# the twilio provider; dev mode's fixed code has neither expiry nor a guess limit.
OTP_TTL_SECONDS = _int("OTP_TTL_SECONDS", 300)
OTP_MAX_ATTEMPTS = _int("OTP_MAX_ATTEMPTS", 5)
# Minimum time between two OTP sends to the same number, so a script can't spam
# a stranger's phone (or run up your Twilio bill) via /auth/request-otp.
OTP_RESEND_COOLDOWN_SECONDS = _int("OTP_RESEND_COOLDOWN_SECONDS", 45)

# --------------------------------------------------------------------------
# Admin (app-owner) panel login
# --------------------------------------------------------------------------
# Guards the /admin/* endpoints -- not a seller's own app-open PIN (that's a
# separate, per-seller feature; see /me/pin and app/pin-lock.tsx). After this
# many wrong PINs in a row, further attempts are rejected outright for
# ADMIN_LOGIN_LOCKOUT_SECONDS, regardless of whether the PIN offered is right,
# so brute-forcing it takes a lot longer than guessing a 6-digit number would
# otherwise take.
ADMIN_LOGIN_MAX_ATTEMPTS = _int("ADMIN_LOGIN_MAX_ATTEMPTS", 5)
ADMIN_LOGIN_LOCKOUT_SECONDS = _int("ADMIN_LOGIN_LOCKOUT_SECONDS", 15 * 60)

# --------------------------------------------------------------------------
# Public URL
# --------------------------------------------------------------------------
# The externally reachable base URL of this backend, e.g. https://api.example.com.
# Used to build absolute image URLs and local upload URLs. Leave it empty and the
# app emits root-relative URLs instead, which is correct whenever the frontend is
# served from the same origin (see SERVE_FRONTEND below).
BACKEND_PUBLIC_URL = _str("BACKEND_PUBLIC_URL").rstrip("/")

# Comma-separated list of allowed CORS origins, e.g.
#   CORS_ORIGINS=https://shop.example.com,https://admin.example.com
# Defaults to "*" which is fine when the API is public and token-authenticated,
# but set it explicitly in production if you can.
CORS_ORIGINS = _list("CORS_ORIGINS", "*")

# --------------------------------------------------------------------------
# Static frontend (optional single-container deployment)
# --------------------------------------------------------------------------
# Point this at the output of `yarn build:web` (frontend/dist) and this backend
# will serve the web app itself, so one container serves API + UI from one
# origin. Leave it unset to deploy the frontend separately (CDN, Nginx, Vercel,
# Netlify, S3+CloudFront, ...).
SERVE_FRONTEND = _str("SERVE_FRONTEND")

# --------------------------------------------------------------------------
# Storage
# --------------------------------------------------------------------------
# "local" writes uploads to a directory on disk (simplest; needs a persistent
# volume). "s3" talks to any S3-compatible object store: AWS S3, Backblaze B2,
# Cloudflare R2, MinIO, DigitalOcean Spaces, Wasabi, Ceph RGW, and so on.
#
# Legacy B2_* names are still honoured so an existing deployment keeps working
# without touching its environment.
STORAGE_BACKEND = _str("STORAGE_BACKEND").lower()

#         Credentials are read from S3_* first, then the legacy B2_* names, then the
# standard AWS_* names. Note that AWS_* is only used to *fill in* credentials --
# never to decide that S3 is wanted at all. Ambient AWS credentials are common on
# EC2, ECS, CodeBuild and many CI runners, and silently switching an app's storage
# backend because a build machine happens to export them is a nasty surprise.
_S3_SELECTED_EXPLICITLY = bool(
    _str("S3_ACCESS_KEY_ID") or _str("B2_KEY_ID") or _str("S3_BUCKET") or _str("B2_BUCKET")
)

S3_ACCESS_KEY_ID = _str("S3_ACCESS_KEY_ID") or _str("B2_KEY_ID") or _str("AWS_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = (
    _str("S3_SECRET_ACCESS_KEY") or _str("B2_APPLICATION_KEY") or _str("AWS_SECRET_ACCESS_KEY")
)
S3_REGION = _str("S3_REGION") or _str("B2_REGION") or _str("AWS_REGION") or "us-east-1"
S3_BUCKET = _str("S3_BUCKET") or _str("B2_BUCKET") or "quicksell"
# Endpoint URL is required for non-AWS providers (B2, R2, MinIO, Spaces).
# Leave it empty for AWS S3 itself.
S3_ENDPOINT_URL = _str("S3_ENDPOINT_URL") or _str("B2_ENDPOINT_URL")
# Path-style addressing is needed by MinIO and some self-hosted gateways.
S3_FORCE_PATH_STYLE = _bool("S3_FORCE_PATH_STYLE", False)

# Where "local" storage keeps its files. Mount a volume here in a container.
MEDIA_ROOT = Path(_str("MEDIA_ROOT", str(ROOT_DIR / "media"))).expanduser()

# How long a presigned upload URL stays valid, in seconds.
UPLOAD_URL_TTL = _int("UPLOAD_URL_TTL", 600)

# Reject uploads larger than this (local backend only; for S3 enforce it with a
# bucket policy or presigned POST conditions if you need a hard limit).
MAX_UPLOAD_BYTES = _int("MAX_UPLOAD_BYTES", 15 * 1024 * 1024)


def _resolve_storage_backend() -> str:
    """Pick a storage backend, preferring an explicit choice."""
    if STORAGE_BACKEND in ("local", "s3"):
        return STORAGE_BACKEND
    if STORAGE_BACKEND:
        raise ConfigError(
            f"STORAGE_BACKEND must be 'local' or 's3', got {STORAGE_BACKEND!r}"
        )
    # Not set: infer from whether S3/B2 settings were named explicitly. This keeps
    # existing B2-backed deployments working untouched, and gives a zero-config
    # local experience for everyone else. Ambient AWS_* credentials deliberately
    # do not count -- see the note above.
    if _S3_SELECTED_EXPLICITLY and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY:
        return "s3"
    return "local"


STORAGE = _resolve_storage_backend()


def validate() -> None:
    """Fail fast with an actionable message, or warn loudly in development.

    Called once at application startup.
    """
    problems: list[str] = []
    warnings: list[str] = []

    if JWT_SECRET == _DEV_JWT_SECRET:
        if IS_PRODUCTION:
            problems.append(
                "JWT_SECRET is unset or still the development placeholder. Generate one with:\n"
                "      python -c 'import secrets; print(secrets.token_urlsafe(48))'"
            )
        elif JWT_SECRET_WAS_UNSET:
            warnings.append(
                "JWT_SECRET is not set; using a well-known development secret. "
                "Never run like this in production."
            )

    if not MONGO_URL:
        problems.append("MONGO_URL is not set (e.g. mongodb://localhost:27017).")
    if not DB_NAME:
        problems.append("DB_NAME is not set (e.g. quicksell).")

    if STORAGE == "s3":
        if not S3_ACCESS_KEY_ID or not S3_SECRET_ACCESS_KEY:
            problems.append(
                "STORAGE_BACKEND=s3 requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
            )
        if not S3_BUCKET:
            problems.append("STORAGE_BACKEND=s3 requires S3_BUCKET.")
    else:
        try:
            MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            problems.append(f"MEDIA_ROOT {MEDIA_ROOT} is not writable: {exc}")
        if IS_PRODUCTION:
            warnings.append(
                f"Using local disk storage at {MEDIA_ROOT}. Make sure that path is a "
                "persistent volume, or uploaded images vanish when the container restarts."
            )

    if IS_PRODUCTION and CORS_ORIGINS == ["*"]:
        warnings.append(
            "CORS_ORIGINS is '*'. Consider listing your real frontend origins instead."
        )

    if SERVE_FRONTEND and not Path(SERVE_FRONTEND).is_dir():
        problems.append(
            f"SERVE_FRONTEND points at {SERVE_FRONTEND!r}, which is not a directory. "
            "Build the web app first (cd frontend && yarn build:web)."
        )

    for warning in warnings:
        logger.warning(warning)

    if problems:
        message = "\n".join(f"  - {p}" for p in problems)
        raise ConfigError(
            "Invalid configuration. Fix the following and restart "
            "(see backend/.env.example):\n" + message
        )


def summary() -> str:
    """One-line description of the active configuration, for the startup log."""
    where = f"s3://{S3_BUCKET}" if STORAGE == "s3" else str(MEDIA_ROOT)
    endpoint = f" via {S3_ENDPOINT_URL}" if (STORAGE == "s3" and S3_ENDPOINT_URL) else ""
    return (
        f"env={APP_ENV} db={DB_NAME} storage={STORAGE}({where}{endpoint}) "
        f"public_url={BACKEND_PUBLIC_URL or '(relative)'} "
        f"frontend={'served' if SERVE_FRONTEND else 'separate'}"
    )
