from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import uuid
import logging
import bcrypt
import jwt as pyjwt
import boto3
from botocore.config import Config as BotoConfig
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXP_DAYS = int(os.environ.get("JWT_EXP_DAYS", "30"))
DEV_OTP_CODE = os.environ.get("DEV_OTP_CODE", "123456")
B2_KEY_ID = os.environ.get("B2_KEY_ID", "")
B2_APPLICATION_KEY = os.environ.get("B2_APPLICATION_KEY", "")
B2_REGION = os.environ.get("B2_REGION", "us-east-005")
B2_BUCKET = os.environ.get("B2_BUCKET", "quicksell")
B2_ENDPOINT_URL = os.environ.get("B2_ENDPOINT_URL", "https://s3.us-east-005.backblazeb2.com")
BACKEND_PUBLIC_URL = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="QuickSell Seller API")
api = APIRouter(prefix="/api")
templates = Jinja2Templates(directory=str(ROOT_DIR / "templates"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("quicksell")

# ---------- B2 client ----------
def get_b2_client():
    return boto3.client(
        "s3",
        region_name=B2_REGION,
        endpoint_url=B2_ENDPOINT_URL,
        aws_access_key_id=B2_KEY_ID,
        aws_secret_access_key=B2_APPLICATION_KEY,
        config=BotoConfig(signature_version="s3v4"),
    )

def build_b2_public_url(key: str) -> str:
    # Stable, cacheable, no-expiry proxy URL. Bucket can stay private.
    if BACKEND_PUBLIC_URL:
        return f"{BACKEND_PUBLIC_URL}/api/images?key={key}"
    return f"/api/images?key={key}"

_B2_DIRECT_PREFIX = f"{B2_ENDPOINT_URL}/{B2_BUCKET}/"

def _proxy_url_for(value: str) -> str:
    """Convert any legacy direct-B2 URL or a bare key into the stable proxy URL.
    Idempotent: re-applying it keeps the proxy URL stable.
    """
    if not isinstance(value, str) or not value:
        return value
    # Already a proxy URL
    if "/api/images?key=" in value:
        return value
    # Legacy direct B2 URL (possibly with presigned query string)
    if value.startswith(_B2_DIRECT_PREFIX):
        rest = value[len(_B2_DIRECT_PREFIX):]
        key = rest.split("?", 1)[0]
        return build_b2_public_url(key)
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
        s = {"id": "global", "otp_provider": "dev", "admin_pin": "0000", "created_at": now_iso()}
        await db.settings.insert_one(s.copy())
        s.pop("_id", None)
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
    # Twilio path (not implemented yet)
    raise HTTPException(503, "SMS provider not configured. Enable dev mode in admin.")

@api.post("/auth/verify-otp")
async def verify_otp(body: OtpVerify):
    settings = await get_settings()
    mobile = body.mobile_number.strip()
    if settings["otp_provider"] == "dev":
        if body.code != DEV_OTP_CODE:
            raise HTTPException(400, "Invalid OTP")
    else:
        raise HTTPException(503, "SMS provider not configured.")

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

# ---------- Uploads (Backblaze B2 presigned PUT) ----------
@api.post("/uploads/presign")
async def presign_upload(body: PresignReq, user=Depends(current_user)):
    safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", body.filename)[:80]
    key = f"sellers/{user['id']}/{gen_id()}-{safe_name}"
    try:
        s3 = get_b2_client()
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": B2_BUCKET, "Key": key, "ContentType": body.content_type},
            ExpiresIn=600,
        )
    except Exception as e:
        logger.exception("presign failed")
        raise HTTPException(500, f"Presign failed: {e}")
    return {"upload_url": url, "key": key, "public_url": build_b2_public_url(key), "expires_in": 600}

@api.get("/uploads/signed-get")
async def signed_get(key: str, user=Depends(current_user)):
    try:
        s3 = get_b2_client()
        url = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": B2_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(500, f"Signed get failed: {e}")

# ---- Public image proxy (stable, cacheable) ----
@api.get("/images")
async def images_proxy(key: str):
    if not key or ".." in key:
        raise HTTPException(400, "Invalid key")
    try:
        s3 = get_b2_client()
        obj = s3.get_object(Bucket=B2_BUCKET, Key=key)
    except Exception as e:
        logger.warning(f"image proxy miss for {key}: {e}")
        raise HTTPException(404, "Image not found")
    body = obj["Body"]
    media_type = obj.get("ContentType") or "image/jpeg"
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": str(obj.get("ContentLength", "")) if obj.get("ContentLength") else "",
    }
    return StreamingResponse(body.iter_chunks(chunk_size=64 * 1024), media_type=media_type, headers={k: v for k, v in headers.items() if v})

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

# ---------- Admin ----------
class AdminLogin(BaseModel):
    pin: str

@api.post("/admin/login")
async def admin_login(body: AdminLogin):
    s = await get_settings()
    if body.pin != s.get("admin_pin", "0000"):
        raise HTTPException(401, "Wrong admin PIN")
    return {"ok": True}

@api.get("/admin/settings")
async def get_admin_settings(x_admin_pin: Optional[str] = Header(None)):
    s = await get_settings()
    if x_admin_pin != s.get("admin_pin", "0000"):
        raise HTTPException(401, "Unauthorized")
    return {"otp_provider": s["otp_provider"], "admin_pin_set": True}

@api.put("/admin/settings")
async def update_admin_settings(body: AdminSettingsUpdate, x_admin_pin: Optional[str] = Header(None)):
    s = await get_settings()
    if x_admin_pin != s.get("admin_pin", "0000"):
        raise HTTPException(401, "Unauthorized")
    update: Dict[str, Any] = {}
    if body.otp_provider in ("dev", "twilio"):
        update["otp_provider"] = body.otp_provider
    if body.admin_pin and re.match(r"^\d{4,8}$", body.admin_pin):
        update["admin_pin"] = body.admin_pin
    if update:
        await db.settings.update_one({"id": "global"}, {"$set": update})
    s = await get_settings()
    return {"otp_provider": s["otp_provider"]}

# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
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
    # One-time normalization: rewrite any legacy presigned/direct B2 URLs in products
    # to the stable proxy form so they survive future write-backs.
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
