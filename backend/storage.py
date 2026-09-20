"""
Pluggable object storage for product images.

Two interchangeable backends, chosen by STORAGE_BACKEND:

  local  Files live on a directory on disk (MEDIA_ROOT). No cloud account, no
         credentials. Mount a persistent volume at MEDIA_ROOT in a container.

  s3     Any S3-compatible object store: AWS S3, Backblaze B2, Cloudflare R2,
         MinIO, DigitalOcean Spaces, Wasabi, Ceph RGW. Set the endpoint URL for
         anything that is not AWS.

Both expose the same three operations, so the rest of the app never knows or
cares which one is active:

  presign_put(key, content_type)  -> a URL the client can PUT bytes straight to
  open(key)                       -> (stream/bytes, content_type, content_length)
  delete(key)                     -> best-effort removal

The upload flow is identical for both backends, which is what keeps the mobile
client unchanged: the client asks the API for an upload URL and PUTs the image to
it. For "s3" that URL is a presigned S3 URL and the bytes never touch this
server. For "local" it is a short-lived, signed URL pointing back at this API's
own PUT endpoint.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import mimetypes
import os
import re
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Iterator, Optional, Tuple

import config

logger = logging.getLogger("quicksell.storage")

# Keys are generated server-side, but validate anyway: these arrive as user input
# on the read path, and a key must never be able to escape its prefix.
_SAFE_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/_.\-]{0,255}$")


class StorageError(RuntimeError):
    pass


class NotFound(StorageError):
    pass


def validate_key(key: str) -> str:
    if not key or ".." in key or key.startswith("/") or not _SAFE_KEY.match(key):
        raise StorageError(f"Invalid storage key: {key!r}")
    return key


class Storage(ABC):
    """Interface every backend implements."""

    name: str

    @abstractmethod
    def presign_put(self, key: str, content_type: str) -> str:
        """Return a URL the client may PUT raw bytes to."""

    @abstractmethod
    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        """Return a URL that serves the object directly."""

    @abstractmethod
    def open(self, key: str) -> Tuple[Any, str, Optional[int]]:
        """Return (body, content_type, content_length).

        `body` is either a bytes-like object or a file-like object with .read().
        Raises NotFound if the object does not exist.
        """

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the object. Missing objects are not an error."""

    def exists(self, key: str) -> bool:
        try:
            body, _, _ = self.open(key)
        except NotFound:
            return False
        close = getattr(body, "close", None)
        if callable(close):
            close()
        return True


# --------------------------------------------------------------------------
# Local disk
# --------------------------------------------------------------------------
class LocalStorage(Storage):
    """Stores objects as files under MEDIA_ROOT.

    Uploads come back through this API rather than going to a third party, so the
    "presigned" URL is an HMAC-signed URL for PUT /api/uploads/direct. The
    signature covers the key, the content type and an expiry, so a client cannot
    write to an arbitrary key or replay the URL forever.
    """

    name = "local"

    def __init__(self, root: Path, secret: str, public_base: str = ""):
        self.root = Path(root)
        self.secret = secret.encode()
        self.public_base = public_base.rstrip("/")
        self.root.mkdir(parents=True, exist_ok=True)

    # -- signing ---------------------------------------------------------
    def _signature(self, key: str, content_type: str, expires: int) -> str:
        payload = f"{key}\n{content_type}\n{expires}".encode()
        digest = hmac.new(self.secret, payload, hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).decode().rstrip("=")

    def verify_put_token(self, key: str, content_type: str, expires: int, signature: str) -> None:
        """Raise StorageError unless the signature is valid and unexpired."""
        if expires < int(time.time()):
            raise StorageError("Upload URL has expired")
        expected = self._signature(key, content_type, expires)
        if not hmac.compare_digest(expected, signature):
            raise StorageError("Upload URL signature is invalid")

    # -- interface -------------------------------------------------------
    def presign_put(self, key: str, content_type: str) -> str:
        validate_key(key)
        expires = int(time.time()) + config.UPLOAD_URL_TTL
        signature = self._signature(key, content_type, expires)
        from urllib.parse import urlencode

        query = urlencode(
            {
                "key": key,
                "content_type": content_type,
                "expires": expires,
                "signature": signature,
            }
        )
        return f"{self.public_base}/api/uploads/direct?{query}"

    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        validate_key(key)
        from urllib.parse import quote

        return f"{self.public_base}/api/images?key={quote(key, safe='')}"

    def _path_for(self, key: str) -> Path:
        validate_key(key)
        path = (self.root / key).resolve()
        root = self.root.resolve()
        # Belt and braces: even with a validated key, never serve outside the root.
        if root != path and root not in path.parents:
            raise StorageError("Resolved path escapes MEDIA_ROOT")
        return path

    def write(self, key: str, data: bytes, content_type: str = "") -> None:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(data)
        os.replace(tmp, path)

    def open(self, key: str) -> Tuple[Any, str, Optional[int]]:
        path = self._path_for(key)
        if not path.is_file():
            raise NotFound(key)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return path.open("rb"), content_type, path.stat().st_size

    def delete(self, key: str) -> None:
        try:
            self._path_for(key).unlink(missing_ok=True)
        except (OSError, StorageError) as exc:
            logger.warning("local delete failed for %s: %s", key, exc)


# --------------------------------------------------------------------------
# S3-compatible
# --------------------------------------------------------------------------
class S3Storage(Storage):
    """Talks to any S3-compatible endpoint via boto3."""

    name = "s3"

    def __init__(
        self,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        endpoint_url: str = "",
        force_path_style: bool = False,
    ):
        self.bucket = bucket
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region
        self._endpoint_url = endpoint_url or None
        self._force_path_style = force_path_style
        self._client = None

    @property
    def client(self):
        # Created lazily and cached: boto3 client construction does no I/O, but
        # this keeps import time fast and makes the object easy to fake in tests.
        if self._client is None:
            import boto3
            from botocore.config import Config as BotoConfig

            self._client = boto3.client(
                "s3",
                region_name=self._region,
                endpoint_url=self._endpoint_url,
                aws_access_key_id=self._access_key,
                aws_secret_access_key=self._secret_key,
                config=BotoConfig(
                    signature_version="s3v4",
                    s3={"addressing_style": "path" if self._force_path_style else "auto"},
                ),
            )
        return self._client

    def presign_put(self, key: str, content_type: str) -> str:
        validate_key(key)
        return self.client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=config.UPLOAD_URL_TTL,
        )

    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        validate_key(key)
        return self.client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def open(self, key: str) -> Tuple[Any, str, Optional[int]]:
        validate_key(key)
        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:  # botocore raises ClientError subclasses
            raise NotFound(f"{key}: {exc}") from exc
        return (
            obj["Body"],
            obj.get("ContentType") or "application/octet-stream",
            obj.get("ContentLength"),
        )

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            logger.warning("s3 delete failed for %s: %s", key, exc)


# --------------------------------------------------------------------------
# Factory
# --------------------------------------------------------------------------
_instance: Optional[Storage] = None


def get_storage() -> Storage:
    """Return the configured storage backend (created once, then reused)."""
    global _instance
    if _instance is not None:
        return _instance

    if config.STORAGE == "s3":
        _instance = S3Storage(
            bucket=config.S3_BUCKET,
            access_key=config.S3_ACCESS_KEY_ID,
            secret_key=config.S3_SECRET_ACCESS_KEY,
            region=config.S3_REGION,
            endpoint_url=config.S3_ENDPOINT_URL,
            force_path_style=config.S3_FORCE_PATH_STYLE,
        )
    else:
        _instance = LocalStorage(
            root=config.MEDIA_ROOT,
            secret=config.JWT_SECRET,
            public_base=config.BACKEND_PUBLIC_URL,
        )
    logger.info("storage backend: %s", _instance.name)
    return _instance


def reset_storage() -> None:
    """Drop the cached instance. Used by tests."""
    global _instance
    _instance = None


def iter_stream(body: Any, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    """Yield chunks from either a boto3 StreamingBody or a plain file object."""
    iter_chunks = getattr(body, "iter_chunks", None)
    if callable(iter_chunks):
        yield from iter_chunks(chunk_size=chunk_size)
        return
    try:
        while True:
            chunk = body.read(chunk_size)
            if not chunk:
                return
            yield chunk
    finally:
        close = getattr(body, "close", None)
        if callable(close):
            close()
