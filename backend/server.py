from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.templating import Jinja2Templates
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import re
import secrets
import uuid
import logging
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

import config
import storage as storage_mod

ROOT_DIR = config.ROOT_DIR

# Configuration lives in config.py and comes entirely from the environment.
# See backend/.env.example for the full list.
MONGO_URL = config.MONGO_URL
DB_NAME = config.DB_NAME
JWT_SECRET = config.JWT_SECRET
JWT_EXP_DAYS = config.JWT_EXP_DAYS
DEV_OTP_CODE = config.DEV_OTP_CODE
BACKEND_PUBLIC_URL = config.BACKEND_PUBLIC_URL

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="QuickSell Seller API")
api = APIRouter(prefix="/api")
templates = Jinja2Templates(directory=str(ROOT_DIR / "templates"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("quicksell")

# ---------- Storage ----------
def get_storage() -> storage_mod.Storage:
    """The configured object store: local disk or any S3-compatible service."""
    return storage_mod.get_storage()

def build_public_url(key: str) -> str:
    """Stable, cacheable, never-expiring URL for an image.

    Always points at this API's own /api/images proxy, so the bucket can stay
    private and the URL stored in the database never goes stale. When
    BACKEND_PUBLIC_URL is unset the URL is root-relative, which is what you want
    if the frontend is served from this same origin.
    """
    from urllib.parse import quote

    # safe="/" keeps slashes literal, so URLs are byte-identical to the ones
    # already stored in existing databases. Keys are sanitised on the way in, so
    # there is normally nothing to escape anyway.
    encoded = quote(key, safe="/")
    if BACKEND_PUBLIC_URL:
        return f"{BACKEND_PUBLIC_URL}/api/images?key={encoded}"
    return f"/api/images?key={encoded}"

# Recognises a direct object-store URL for any S3-compatible provider, e.g.
#   https://s3.us-east-005.backblazeb2.com/quicksell/sellers/<id>/<file>
#   https://<bucket>.s3.<region>.amazonaws.com/sellers/<id>/<file>
#   https://<account>.r2.cloudflarestorage.com/<bucket>/sellers/...
# Legacy rows may hold one of these, with or without a presigned query string.
_DIRECT_URL_RE = re.compile(r"^https?://[^/]+/(?:[^/]+/)*?(sellers/[^?]+)")

def _proxy_url_for(value: str) -> str:
    """Normalise any stored image value to the stable proxy URL.

    Handles values already in proxy form, bare storage keys, and legacy direct
    object-store URLs from any provider. Idempotent.
    """
    if not isinstance(value, str) or not value:
        return value
    # Already a proxy URL
    if "/api/images?key=" in value:
        return value
    # A bare storage key
    if value.startswith("sellers/"):
        return build_public_url(value.split("?", 1)[0])
    # Legacy direct object-store URL (possibly presigned)
    match = _DIRECT_URL_RE.match(value)
    if match:
        return build_public_url(match.group(1))
    # Something else entirely (an external image URL, say) — leave it alone.
    return value

def normalize_image_urls(urls: List[str]) -> List[str]:
    return [_proxy_url_for(u) for u in urls if u]

def sign_product(p: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(p, dict) and isinstance(p.get("image_urls"), list):
        p["image_urls"] = [_proxy_url_for(u) for u in p["image_urls"]]
    return p

def sign_order(o: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(o, dict) and isinstance(o.get("items"), list):
        for it in o["items"]:
            if isinstance(it, dict) and it.get("image_url"):
                it["image_url"] = _proxy_url_for(it["image_url"])
    return o

def sign_shop(shop: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(shop, dict):
        if shop.get("logo_url"):
            shop["logo_url"] = _proxy_url_for(shop["logo_url"])
        if shop.get("banner_url"):
            shop["banner_url"] = _proxy_url_for(shop["banner_url"])
    return shop

# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def gen_id() -> str:
    return str(uuid.uuid4())

def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

def verify_pin_hash(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode(), hashed.encode())
    except Exception:
        return False

def generate_otp_code() -> str:
    return f"{secrets.randbelow(10 ** 6):06d}"

def send_otp_sms(mobile: str, code: str) -> None:
    """Send an OTP over SMS via Twilio. Synchronous (the Twilio SDK has no async
    API) -- callers in an async route must run this via asyncio.to_thread, the
    same reason get_storage().open() is, so one slow send can't stall every
    other request this single-worker process is handling concurrently."""
    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException

    client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    minutes = max(1, config.OTP_TTL_SECONDS // 60)
    kwargs: Dict[str, Any] = {
        "to": mobile,
        "body": f"Your QuickSell verification code is {code}. It expires in {minutes} minute(s).",
    }
    if config.TWILIO_MESSAGING_SERVICE_SID:
        kwargs["messaging_service_sid"] = config.TWILIO_MESSAGING_SERVICE_SID
    else:
        kwargs["from_"] = config.TWILIO_FROM_NUMBER
    try:
        client.messages.create(**kwargs)
    except TwilioRestException as exc:
        logger.exception(f"twilio send failed for {mobile}")
        raise HTTPException(502, "Could not send the SMS. Please try again shortly.") from exc

def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

bearer = HTTPBearer(auto_error=False)

async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    if not cred:
        raise HTTPException(401, "Missing token")
    try:
        payload = pyjwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

# ---------- Models ----------
class OtpRequest(BaseModel):
    mobile_number: str

class OtpVerify(BaseModel):
    mobile_number: str
    code: str

class PinSet(BaseModel):
    pin: str

class PinVerify(BaseModel):
    pin: str

class HandleClaim(BaseModel):
    handle: str

class ShopCustomization(BaseModel):
    title: Optional[str] = None
    tagline: Optional[str] = None
    bg_color: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    whatsapp_number: Optional[str] = None
    # Contact & address (Feature 2)
    address: Optional[str] = None
    mobile_primary: Optional[str] = None
    mobile_secondary: Optional[str] = None
    landline: Optional[str] = None
    maps_url: Optional[str] = None
    # Buyer gate (Feature 4)
    gate_enabled: Optional[bool] = None
    gate_required: Optional[bool] = None
    gate_title: Optional[str] = None
    gate_subtitle: Optional[str] = None

class GroupCreate(BaseModel):
    name: str

class GroupUpdate(BaseModel):
    name: str

class ProductIn(BaseModel):
    title: str
    description: Optional[str] = ""
    price: float
    min_quantity: int = 1
    status: str = "Available"  # Available, Limited stock, Will be available shortly, Out of stock
    group_id: Optional[str] = None
    image_urls: List[str] = []

class OrderItemIn(BaseModel):
    product_id: str
    quantity: int

class OrderCreate(BaseModel):
    buyer_name: str
    buyer_mobile: str
    buyer_address: str
    items: List[OrderItemIn]

class OrderStatus(BaseModel):
    status: str  # Pending, Accepted, Shipped, Cancelled

class PresignReq(BaseModel):
    filename: str
    content_type: str = "image/jpeg"

class AdminSettingsUpdate(BaseModel):
    otp_provider: Optional[str] = None  # 'dev' or 'twilio'
    admin_pin: Optional[str] = None

# ---------- Settings (admin) ----------
async def get_settings() -> Dict[str, Any]:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not s:
        s = {
            "id": "global",
            "otp_provider": "dev",
            "admin_pin_hash": hash_pin("0000"),
            "admin_login_fail_count": 0,
            "admin_locked_until": None,
            "created_at": now_iso(),
        }
        await db.settings.insert_one(s.copy())
        s.pop("_id", None)
        return s
    # One-time migration: an older version of this app stored the admin PIN in
    # plaintext. Hash it and drop the plaintext field the first time it's seen.
    if "admin_pin_hash" not in s:
        pin_hash = hash_pin(s.get("admin_pin") or "0000")
        await db.settings.update_one(
            {"id": "global"},
            {"$set": {"admin_pin_hash": pin_hash}, "$unset": {"admin_pin": ""}},
        )
        s["admin_pin_hash"] = pin_hash
        s.pop("admin_pin", None)
    s.setdefault("admin_login_fail_count", 0)
    s.setdefault("admin_locked_until", None)
    return s

# ---------- Auth ----------
@api.get("/")
async def root():
    return {"service": "QuickSell Seller API", "ok": True}

@api.post("/auth/request-otp")
async def request_otp(body: OtpRequest):
    settings = await get_settings()
    mobile = body.mobile_number.strip()
    if not re.match(r"^\+?\d{7,15}$", mobile):
        raise HTTPException(400, "Invalid mobile number")
    if settings["otp_provider"] == "dev":
        return {"ok": True, "dev_mode": True, "dev_code": DEV_OTP_CODE}

    existing = await db.otp_codes.find_one({"mobile_number": mobile}, {"_id": 0})
    if existing:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(existing["last_sent_at"])).total_seconds()
        if elapsed < config.OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(config.OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(429, f"Please wait {wait}s before requesting another code.")

    code = generate_otp_code()
    await db.otp_codes.update_one(
        {"mobile_number": mobile},
        {"$set": {
            "mobile_number": mobile,
            "code_hash": hash_pin(code),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=config.OTP_TTL_SECONDS)).isoformat(),
            "attempts": 0,
            "last_sent_at": now_iso(),
        }},
        upsert=True,
    )
    await asyncio.to_thread(send_otp_sms, mobile, code)
    return {"ok": True, "dev_mode": False}

@api.post("/auth/verify-otp")
async def verify_otp(body: OtpVerify):
    settings = await get_settings()
    mobile = body.mobile_number.strip()
    if settings["otp_provider"] == "dev":
        if body.code != DEV_OTP_CODE:
            raise HTTPException(400, "Invalid OTP")
    else:
        record = await db.otp_codes.find_one({"mobile_number": mobile}, {"_id": 0})
        if not record:
            raise HTTPException(400, "No code requested for this number. Request a new one.")
        if datetime.now(timezone.utc) > datetime.fromisoformat(record["expires_at"]):
            await db.otp_codes.delete_one({"mobile_number": mobile})
            raise HTTPException(400, "Code expired. Request a new one.")
        if record.get("attempts", 0) >= config.OTP_MAX_ATTEMPTS:
            await db.otp_codes.delete_one({"mobile_number": mobile})
            raise HTTPException(400, "Too many wrong attempts. Request a new code.")
        if not verify_pin_hash(body.code, record["code_hash"]):
            await db.otp_codes.update_one({"mobile_number": mobile}, {"$inc": {"attempts": 1}})
            raise HTTPException(400, "Invalid OTP")
        await db.otp_codes.delete_one({"mobile_number": mobile})

    user = await db.users.find_one({"mobile_number": mobile}, {"_id": 0})
    is_new = False
    if not user:
        user = {
            "id": gen_id(),
            "mobile_number": mobile,
            "pin_hash": None,
            "handle": None,
            "shop": {
                "title": "",
                "tagline": "",
                "bg_color": "#C25B4E",
                "logo_url": None,
                "banner_url": None,
                "whatsapp_number": mobile,
            },
            "created_at": now_iso(),
        }
        await db.users.insert_one(user.copy())
        is_new = True
        user.pop("_id", None)

    token = make_token(user["id"])
    return {
        "token": token,
        "is_new": is_new,
        "user": {
            "id": user["id"],
            "mobile_number": user["mobile_number"],
            "handle": user.get("handle"),
            "has_pin": bool(user.get("pin_hash")),
            "shop": user.get("shop", {}),
        },
    }

@api.post("/auth/set-pin")
async def set_pin(body: PinSet, user=Depends(current_user)):
    if not re.match(r"^\d{4}$", body.pin):
        raise HTTPException(400, "PIN must be 4 digits")
    await db.users.update_one({"id": user["id"]}, {"$set": {"pin_hash": hash_pin(body.pin)}})
    return {"ok": True}

@api.post("/auth/verify-pin")
async def verify_pin(body: PinVerify, user=Depends(current_user)):
    if not user.get("pin_hash"):
        raise HTTPException(400, "PIN not set")
    if not verify_pin_hash(body.pin, user["pin_hash"]):
        raise HTTPException(401, "Wrong PIN")
    return {"ok": True}

# ---------- Handle ----------
@api.get("/handles/check")
async def check_handle(handle: str):
    h = handle.strip().lower()
    if not re.match(r"^[a-z0-9][a-z0-9_-]{2,29}$", h):
        return {"available": False, "reason": "Use 3-30 chars: lowercase letters, digits, _ or -"}
    exists = await db.users.find_one({"handle": h}, {"_id": 0, "id": 1})
    return {"available": not exists, "handle": h}

@api.post("/handles/claim")
async def claim_handle(body: HandleClaim, user=Depends(current_user)):
    h = body.handle.strip().lower()
    if not re.match(r"^[a-z0-9][a-z0-9_-]{2,29}$", h):
        raise HTTPException(400, "Invalid handle")
    exists = await db.users.find_one({"handle": h, "id": {"$ne": user["id"]}}, {"_id": 0})
    if exists:
        raise HTTPException(409, "Handle taken")
    await db.users.update_one({"id": user["id"]}, {"$set": {"handle": h, "shop.title": user.get("shop", {}).get("title") or h}})
    return {"ok": True, "handle": h}

# ---------- Me ----------
@api.get("/me")
async def me(user=Depends(current_user)):
    return {
        "id": user["id"],
        "mobile_number": user["mobile_number"],
        "handle": user.get("handle"),
        "has_pin": bool(user.get("pin_hash")),
        "shop": sign_shop(user.get("shop", {})),
    }

@api.put("/me/shop")
async def update_shop(body: ShopCustomization, user=Depends(current_user)):
    shop = user.get("shop", {})
    update = body.dict(exclude_unset=True)
    shop.update(update)
    await db.users.update_one({"id": user["id"]}, {"$set": {"shop": shop}})
    return {"ok": True, "shop": sign_shop(dict(shop))}

# ---------- Groups ----------
@api.get("/groups")
async def list_groups(user=Depends(current_user)):
    cur = db.groups.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", 1)
    return await cur.to_list(500)

@api.post("/groups")
async def create_group(body: GroupCreate, user=Depends(current_user)):
    doc = {"id": gen_id(), "seller_id": user["id"], "name": body.name.strip(), "created_at": now_iso()}
    await db.groups.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api.put("/groups/{group_id}")
async def update_group(group_id: str, body: GroupUpdate, user=Depends(current_user)):
    res = await db.groups.update_one({"id": group_id, "seller_id": user["id"]}, {"$set": {"name": body.name.strip()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Group not found")
    return {"ok": True}

@api.delete("/groups/{group_id}")
async def delete_group(group_id: str, user=Depends(current_user)):
    await db.groups.delete_one({"id": group_id, "seller_id": user["id"]})
    await db.products.update_many({"seller_id": user["id"], "group_id": group_id}, {"$set": {"group_id": None}})
    return {"ok": True}

# ---------- Products ----------
@api.get("/products")
async def list_products(user=Depends(current_user), group_id: Optional[str] = None, q: Optional[str] = None):
    query: Dict[str, Any] = {"seller_id": user["id"]}
    if group_id:
        query["group_id"] = group_id
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]
    cur = db.products.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(1000)
    return [sign_product(p) for p in items]

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(current_user)):
    doc = body.dict()
    doc["image_urls"] = normalize_image_urls(doc.get("image_urls") or [])
    doc.update({
        "id": gen_id(),
        "seller_id": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await db.products.insert_one(doc.copy())
    doc.pop("_id", None)
    return sign_product(doc)

@api.get("/products/{pid}")
async def get_product(pid: str, user=Depends(current_user)):
    p = await db.products.find_one({"id": pid, "seller_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    return sign_product(p)

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(current_user)):
    update = body.dict()
    update["image_urls"] = normalize_image_urls(update.get("image_urls") or [])
    update["updated_at"] = now_iso()
    res = await db.products.update_one({"id": pid, "seller_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    return sign_product(p)

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(current_user)):
    await db.products.delete_one({"id": pid, "seller_id": user["id"]})
    return {"ok": True}

# ---------- Uploads (presigned PUT, backend-agnostic) ----------
@api.post("/uploads/presign")
async def presign_upload(body: PresignReq, user=Depends(current_user)):
    """Hand the client a URL it can PUT the image bytes to.

    With the S3 backend that URL points straight at the object store and the
    bytes never pass through this server. With the local backend it points back
    at PUT /api/uploads/direct below. Either way the client code is the same.
    """
    safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", body.filename)[:80]
    key = f"sellers/{user['id']}/{gen_id()}-{safe_name}"
    try:
        url = get_storage().presign_put(key, body.content_type)
    except Exception as e:
        logger.exception("presign failed")
        raise HTTPException(500, f"Presign failed: {e}")
    return {
        "upload_url": url,
        "key": key,
        "public_url": build_public_url(key),
        "expires_in": config.UPLOAD_URL_TTL,
    }

@api.put("/uploads/direct")
async def upload_direct(request: Request, key: str, content_type: str, expires: int, signature: str):
    """Receiving end of a local-storage presigned upload.

    Authorised by the HMAC signature in the query string rather than by a bearer
    token, exactly like a presigned S3 URL: the signature covers the key, the
    content type and the expiry, so it cannot be reused for another object or
    replayed once it has expired. Unused when STORAGE_BACKEND=s3.
    """
    store = get_storage()
    if not isinstance(store, storage_mod.LocalStorage):
        raise HTTPException(404, "Direct uploads are only served by the local storage backend")
    try:
        store.verify_put_token(key, content_type, expires, signature)
    except storage_mod.StorageError as e:
        raise HTTPException(403, str(e))

    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty upload")
    if len(body) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            413, f"Upload exceeds MAX_UPLOAD_BYTES ({config.MAX_UPLOAD_BYTES} bytes)"
        )
    try:
        store.write(key, body, content_type)
    except storage_mod.StorageError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "key": key, "public_url": build_public_url(key), "size": len(body)}

@api.get("/uploads/signed-get")
async def signed_get(key: str, user=Depends(current_user)):
    try:
        return {"url": get_storage().presign_get(key, expires_in=3600)}
    except storage_mod.StorageError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Signed get failed: {e}")

# ---- Public image proxy (stable, cacheable) ----
import io
try:
    from PIL import Image
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIC_OK = True
except Exception:
    _HEIC_OK = False

def _is_heic_key(key: str) -> bool:
    k = key.lower()
    return k.endswith(".heic") or k.endswith(".heif")

@api.get("/images")
async def images_proxy(key: str):
    try:
        storage_mod.validate_key(key)
    except storage_mod.StorageError:
        raise HTTPException(400, "Invalid key")
    try:
        # get_storage().open() makes a blocking network call (boto3 has no async
        # API). Run it off the event loop so one slow fetch from the storage
        # backend can't stall every other request this single-worker process is
        # handling concurrently -- that stall is what surfaces to clients as a
        # 502, since nothing else (including health checks) can be served while
        # the loop is blocked.
        raw_body, media_type, content_length = await asyncio.to_thread(get_storage().open, key)
    except storage_mod.NotFound as e:
        logger.warning(f"image proxy miss for {key}: {e}")
        raise HTTPException(404, "Image not found")
    except Exception as e:
        logger.exception("image proxy error")
        raise HTTPException(502, "Image backend unavailable")

    media_type = media_type or "image/jpeg"

    cache_headers = {"Cache-Control": "public, max-age=31536000, immutable"}

    # Transcode HEIC/HEIF to JPEG so all browsers (Chrome/FF/Edge/Android) can render.
    needs_transcode = _HEIC_OK and (
        _is_heic_key(key) or media_type.lower() in ("image/heic", "image/heif")
    )
    if needs_transcode:
        # The body is consumed to transcode, so read it all up front: if the
        # transcode fails we still have the original bytes to fall back on.
        # Blocking I/O against the storage backend, so off the event loop too.
        data = await asyncio.to_thread(raw_body.read)
        try:
            img = Image.open(io.BytesIO(data))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            # Cap dimension for sane payload size on legacy uploads.
            img.thumbnail((1600, 1600))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=82, optimize=True)
            jpeg = out.getvalue()
            return StreamingResponse(
                iter([jpeg]),
                media_type="image/jpeg",
                headers={**cache_headers, "Content-Length": str(len(jpeg))},
            )
        except Exception as e:
            logger.warning(f"HEIC transcode failed for {key}: {e}; falling back to original")
            return StreamingResponse(
                iter([data]),
                media_type=media_type,
                headers={**cache_headers, "Content-Length": str(len(data))},
            )

    if content_length:
        cache_headers["Content-Length"] = str(content_length)
    # iter_stream handles both a boto3 StreamingBody and a plain file object.
    return StreamingResponse(
        storage_mod.iter_stream(raw_body), media_type=media_type, headers=cache_headers
    )

# ---------- Orders ----------
@api.get("/orders")
async def list_orders(user=Depends(current_user), status: Optional[str] = None):
    q: Dict[str, Any] = {"seller_id": user["id"]}
    if status:
        q["status"] = status
    cur = db.orders.find(q, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(500)
    return [sign_order(o) for o in items]

@api.put("/orders/{oid}/status")
async def update_order_status(oid: str, body: OrderStatus, user=Depends(current_user)):
    if body.status not in ("Pending", "Accepted", "Shipped", "Cancelled"):
        raise HTTPException(400, "Invalid status")
    res = await db.orders.update_one({"id": oid, "seller_id": user["id"]}, {"$set": {"status": body.status, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

# ---------- Public storefront (buyer) ----------
@api.get("/shop/{handle}", response_class=HTMLResponse)
async def shop_html(handle: str, request: Request):
    user = await db.users.find_one({"handle": handle.lower()}, {"_id": 0, "pin_hash": 0})
    if not user:
        return HTMLResponse(f"<h1>Shop not found</h1><p>No store at /{handle}</p>", status_code=404)
    groups = await db.groups.find({"seller_id": user["id"]}, {"_id": 0}).to_list(200)
    products = await db.products.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return templates.TemplateResponse("storefront.html", {
        "request": request,
        "seller": {"id": user["id"], "handle": user["handle"], "mobile_number": user["mobile_number"]},
        "shop": sign_shop(dict(user.get("shop", {}))),
        "groups": groups,
        "products": [sign_product(p) for p in products],
        "canonical_url": str(request.url),
    })

@api.get("/storefront/{handle}")
async def storefront(handle: str):
    user = await db.users.find_one({"handle": handle.lower()}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(404, "Store not found")
    groups = await db.groups.find({"seller_id": user["id"]}, {"_id": 0}).to_list(200)
    products = await db.products.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "seller": {
            "id": user["id"],
            "handle": user["handle"],
            "shop": sign_shop(user.get("shop", {})),
            "mobile_number": user["mobile_number"],
        },
        "groups": groups,
        "products": [sign_product(p) for p in products],
    }

@api.post("/storefront/{handle}/orders")
async def create_buyer_order(handle: str, body: OrderCreate):
    user = await db.users.find_one({"handle": handle.lower()}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Store not found")
    items_out = []
    total = 0.0
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id, "seller_id": user["id"]}, {"_id": 0})
        if not p:
            continue
        items_out.append({
            "product_id": p["id"],
            "title": p["title"],
            "quantity": it.quantity,
            "price_at_purchase": p["price"],
            "image_url": (p.get("image_urls") or [None])[0],
        })
        total += p["price"] * it.quantity
    if not items_out:
        raise HTTPException(400, "No valid items")
    order = {
        "id": gen_id(),
        "seller_id": user["id"],
        "buyer_name": body.buyer_name,
        "buyer_mobile": body.buyer_mobile,
        "buyer_address": body.buyer_address,
        "items": items_out,
        "total": total,
        "status": "Pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(order.copy())
    order.pop("_id", None)
    return order

class VisitorIn(BaseModel):
    name: Optional[str] = ""
    mobile: Optional[str] = ""

@api.post("/storefront/{handle}/visitors")
async def record_visitor(handle: str, body: VisitorIn):
    user = await db.users.find_one({"handle": handle.lower()}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(404, "Store not found")
    if not (body.name or body.mobile):
        return {"ok": True}
    doc = {
        "id": gen_id(),
        "seller_id": user["id"],
        "name": (body.name or "").strip(),
        "mobile": (body.mobile or "").strip(),
        "created_at": now_iso(),
    }
    await db.visitors.insert_one(doc.copy())
    return {"ok": True}

@api.get("/visitors")
async def list_visitors(user=Depends(current_user)):
    cur = db.visitors.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)

# ---------- Admin ----------
class AdminLogin(BaseModel):
    pin: str

async def check_admin_pin(pin: Optional[str]) -> Dict[str, Any]:
    """Verify pin against the stored admin hash, with lockout after repeated
    failures. Shared by /admin/login (pin in the request body, since it's the
    very first call and the client has nowhere else to put it yet) and the two
    /admin/settings routes (pin in the X-Admin-PIN header, via require_admin
    below), so brute-forcing either path is equally rate-limited -- guarding
    only one would leave the other as an unlimited-attempts bypass."""
    s = await get_settings()
    locked_until = s.get("admin_locked_until")
    if locked_until:
        locked_dt = datetime.fromisoformat(locked_until)
        if locked_dt > datetime.now(timezone.utc):
            remaining = max(1, int((locked_dt - datetime.now(timezone.utc)).total_seconds()))
            raise HTTPException(429, f"Too many attempts. Try again in {remaining}s.")
    if not pin or not verify_pin_hash(pin, s["admin_pin_hash"]):
        fail_count = s.get("admin_login_fail_count", 0) + 1
        update: Dict[str, Any] = {"admin_login_fail_count": fail_count}
        if fail_count >= config.ADMIN_LOGIN_MAX_ATTEMPTS:
            update["admin_locked_until"] = (
                datetime.now(timezone.utc) + timedelta(seconds=config.ADMIN_LOGIN_LOCKOUT_SECONDS)
            ).isoformat()
            update["admin_login_fail_count"] = 0
            logger.warning("admin panel locked out after repeated failed PIN attempts")
        await db.settings.update_one({"id": "global"}, {"$set": update})
        raise HTTPException(401, "Wrong admin PIN")
    if s.get("admin_login_fail_count"):
        await db.settings.update_one({"id": "global"}, {"$set": {"admin_login_fail_count": 0}})
    return s

async def require_admin(x_admin_pin: Optional[str] = Header(None)) -> Dict[str, Any]:
    return await check_admin_pin(x_admin_pin)

@api.post("/admin/login")
async def admin_login(body: AdminLogin):
    await check_admin_pin(body.pin)
    return {"ok": True}

@api.get("/admin/settings")
async def get_admin_settings(s: Dict[str, Any] = Depends(require_admin)):
    return {
        "otp_provider": s["otp_provider"],
        "admin_pin_set": True,
        "twilio_configured": config.TWILIO_CONFIGURED,
    }

@api.put("/admin/settings")
async def update_admin_settings(body: AdminSettingsUpdate, s: Dict[str, Any] = Depends(require_admin)):
    update: Dict[str, Any] = {}
    if body.otp_provider in ("dev", "twilio"):
        if body.otp_provider == "twilio" and not config.TWILIO_CONFIGURED:
            raise HTTPException(
                400,
                "Twilio isn't configured on the server. Set TWILIO_ACCOUNT_SID, "
                "TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or "
                "TWILIO_FROM_NUMBER, then try again.",
            )
        update["otp_provider"] = body.otp_provider
    if body.admin_pin:
        if not re.match(r"^\d{6,10}$", body.admin_pin):
            raise HTTPException(400, "Admin PIN must be 6-10 digits")
        update["admin_pin_hash"] = hash_pin(body.admin_pin)
    if update:
        await db.settings.update_one({"id": "global"}, {"$set": update})
    s = await get_settings()
    return {"otp_provider": s["otp_provider"]}

# ---------- Health ----------
@api.get("/health")
async def health():
    """Liveness/readiness probe: checks the database round-trips.

    Point your platform's health check at /api/health (Kubernetes, ECS, Render,
    Fly, Docker HEALTHCHECK, a load balancer — they all want one).
    """
    try:
        await db.command("ping")
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "database": "unreachable", "detail": str(e)},
        )
    return {"ok": True, "database": "ok", "storage": config.STORAGE, "env": config.APP_ENV}

# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _mount_frontend() -> None:
    """Optionally serve the built web app from this same process.

    Set SERVE_FRONTEND=/path/to/frontend/dist (the output of `yarn build:web`) and
    one container serves both the API and the UI on one origin — the simplest
    thing to deploy. Leave it unset to host the frontend separately.
    """
    if not config.SERVE_FRONTEND:
        return
    from starlette.staticfiles import StaticFiles
    from starlette.responses import FileResponse, Response

    dist = Path(config.SERVE_FRONTEND)
    if not dist.is_dir():
        # Don't crash on import; config.validate() reports this properly at startup.
        logger.error("SERVE_FRONTEND=%s is not a directory; not serving the frontend", dist)
        return

    index = dist / "index.html"

    class SpaStaticFiles(StaticFiles):
        """StaticFiles with a single-page-app fallback.

        StaticFiles(html=True) serves index.html for a *directory*, but still
        404s on a path that does not exist on disk. The app's routes are
        client-side, so /groups or /onboarding/phone have no file behind them and
        a hard refresh or a shared link would break. Anything not found is
        therefore served index.html, and the router sorts it out in the browser.

        Genuinely missing assets still 404 rather than silently returning HTML,
        which would otherwise turn a mistyped script path into a confusing parse
        error in the console.
        """

        _ASSET_SUFFIXES = {
            ".js", ".mjs", ".css", ".map", ".json", ".png", ".jpg", ".jpeg",
            ".gif", ".svg", ".webp", ".avif", ".ico", ".ttf", ".otf", ".woff",
            ".woff2", ".wasm", ".txt", ".xml", ".webmanifest",
        }

        async def get_response(self, path: str, scope) -> Response:
            from starlette.exceptions import HTTPException as StarletteHTTPException

            try:
                response = await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                # StaticFiles signals a miss by raising, not by returning a 404.
                if exc.status_code != 404:
                    raise
                response = None

            if response is not None and response.status_code != 404:
                return response

            # An unmatched /api/... path is a genuine 404, not a client route.
            # Without this, a typo'd or removed endpoint would answer 200 with
            # HTML, and every API client would report a JSON parse error instead
            # of the 404 that actually happened.
            normalised = path.replace("\\", "/").lstrip("/")
            if normalised == "api" or normalised.startswith("api/"):
                raise StarletteHTTPException(status_code=404, detail="Not Found")

            # A missing file with an asset extension is a genuine 404. Returning
            # index.html for it would turn a bad script path into a baffling
            # "Unexpected token '<'" in the console instead of a clear 404.
            if Path(path).suffix.lower() in self._ASSET_SUFFIXES:
                if response is not None:
                    return response
                raise StarletteHTTPException(status_code=404)

            # Everything else is treated as a client-side route.
            # index.html must not be cached, or a redeploy would be invisible to
            # browsers still holding the old one.
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    app.mount("/", SpaStaticFiles(directory=str(dist), html=True), name="frontend")
    logger.info("serving frontend from %s", dist)

@app.on_event("startup")
async def on_startup():
    # Fail fast and loudly on a misconfigured environment, before taking traffic.
    config.validate()
    logger.info("config: %s", config.summary())
    get_storage()

    # Clean up legacy explicit-null handle docs that block the new partial index.
    await db.users.update_many({"handle": None}, {"$unset": {"handle": ""}})
    # Drop legacy sparse index if present, then recreate as partial-filter.
    try:
        await db.users.drop_index("handle_1")
    except Exception:
        pass
    await db.users.create_index(
        "handle",
        unique=True,
        partialFilterExpression={"handle": {"$type": "string"}},
    )
    await db.users.create_index("mobile_number", unique=True)
    await db.products.create_index([("seller_id", 1), ("created_at", -1)])
    await db.groups.create_index([("seller_id", 1)])
    await db.orders.create_index([("seller_id", 1), ("created_at", -1)])
    await db.otp_codes.create_index("mobile_number", unique=True)
    # One-time normalization: rewrite any legacy presigned/direct object-store URLs
    # in products to the stable proxy form so they survive future write-backs.
    async for p in db.products.find({"image_urls": {"$exists": True, "$ne": []}}, {"id": 1, "image_urls": 1}):
        urls = p.get("image_urls") or []
        cleaned = normalize_image_urls(urls)
        if cleaned != urls:
            await db.products.update_one({"id": p["id"]}, {"$set": {"image_urls": cleaned}})
    await get_settings()
    logger.info("Startup complete")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# Mounted last so the /api routes above always win over the static catch-all.
_mount_frontend()
