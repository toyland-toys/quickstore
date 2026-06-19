"""QuickSell Seller API end-to-end backend tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vendor-marketplace-190.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

UNIQUE = uuid.uuid4().hex[:8]
MOBILE_A = f"+9199{int(time.time()) % 100000000:08d}"
MOBILE_B = f"+9198{int(time.time()) % 100000000:08d}"
HANDLE_A = f"shop{UNIQUE}a"
HANDLE_B = f"shop{UNIQUE}b"

state = {}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- Auth ----------
class TestAuth:
    def test_request_otp_dev(self, s):
        r = s.post(f"{API}/auth/request-otp", json={"mobile_number": MOBILE_A})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("dev_mode") is True
        assert j.get("dev_code") == "123456"

    def test_request_otp_invalid_mobile(self, s):
        r = s.post(f"{API}/auth/request-otp", json={"mobile_number": "abc"})
        assert r.status_code == 400

    def test_verify_otp_bad_code(self, s):
        r = s.post(f"{API}/auth/verify-otp", json={"mobile_number": MOBILE_A, "code": "000000"})
        assert r.status_code == 400

    def test_verify_otp_creates_user(self, s):
        r = s.post(f"{API}/auth/verify-otp", json={"mobile_number": MOBILE_A, "code": "123456"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "token" in j and j["is_new"] is True
        assert j["user"]["has_pin"] is False
        state["token_a"] = j["token"]
        state["user_a"] = j["user"]

    def test_verify_otp_existing_user(self, s):
        r = s.post(f"{API}/auth/verify-otp", json={"mobile_number": MOBILE_A, "code": "123456"})
        assert r.status_code == 200
        assert r.json()["is_new"] is False

    def test_set_pin_and_verify(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.post(f"{API}/auth/set-pin", json={"pin": "1234"}, headers=h)
        assert r.status_code == 200
        r = s.post(f"{API}/auth/verify-pin", json={"pin": "1234"}, headers=h)
        assert r.status_code == 200
        r = s.post(f"{API}/auth/verify-pin", json={"pin": "9999"}, headers=h)
        assert r.status_code == 401

    def test_set_pin_invalid(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.post(f"{API}/auth/set-pin", json={"pin": "12"}, headers=h)
        assert r.status_code == 400

    def test_me_endpoint(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.get(f"{API}/me", headers=h)
        assert r.status_code == 200
        assert r.json()["has_pin"] is True


# ---------- Handles ----------
class TestHandles:
    def test_check_available(self, s):
        r = s.get(f"{API}/handles/check", params={"handle": HANDLE_A})
        assert r.status_code == 200
        assert r.json()["available"] is True

    def test_check_invalid(self, s):
        r = s.get(f"{API}/handles/check", params={"handle": "A!"})
        assert r.json()["available"] is False

    def test_claim_handle(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.post(f"{API}/handles/claim", json={"handle": HANDLE_A}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["handle"] == HANDLE_A

    def test_claim_collision(self, s):
        # Create user B and try to claim same handle
        s.post(f"{API}/auth/request-otp", json={"mobile_number": MOBILE_B})
        r = s.post(f"{API}/auth/verify-otp", json={"mobile_number": MOBILE_B, "code": "123456"})
        assert r.status_code == 200
        state["token_b"] = r.json()["token"]
        h = {"Authorization": f"Bearer {state['token_b']}"}
        r = s.post(f"{API}/handles/claim", json={"handle": HANDLE_A}, headers=h)
        assert r.status_code == 409

    def test_check_unavailable_after_claim(self, s):
        r = s.get(f"{API}/handles/check", params={"handle": HANDLE_A})
        assert r.json()["available"] is False


# ---------- Shop ----------
class TestShop:
    def test_update_shop(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.put(f"{API}/me/shop", json={"title": "My Test Shop", "bg_color": "#123456", "tagline": "Best deals"}, headers=h)
        assert r.status_code == 200
        shop = r.json()["shop"]
        assert shop["title"] == "My Test Shop"
        assert shop["bg_color"] == "#123456"
        # Verify persistence
        r = s.get(f"{API}/me", headers=h)
        assert r.json()["shop"]["title"] == "My Test Shop"


# ---------- Groups & Products ----------
class TestCatalog:
    def test_create_group(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.post(f"{API}/groups", json={"name": "Snacks"}, headers=h)
        assert r.status_code == 200
        state["group_id"] = r.json()["id"]
        assert r.json()["name"] == "Snacks"

    def test_list_groups(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.get(f"{API}/groups", headers=h)
        assert r.status_code == 200
        assert any(g["id"] == state["group_id"] for g in r.json())

    def test_update_group(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.put(f"{API}/groups/{state['group_id']}", json={"name": "Snacks & Drinks"}, headers=h)
        assert r.status_code == 200

    def test_create_product(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        body = {"title": "Chips", "description": "Tasty", "price": 50.0, "min_quantity": 1,
                "status": "Available", "group_id": state["group_id"], "image_urls": ["https://example.com/c.jpg"]}
        r = s.post(f"{API}/products", json=body, headers=h)
        assert r.status_code == 200, r.text
        state["product_id"] = r.json()["id"]
        assert r.json()["price"] == 50.0

    def test_get_product(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.get(f"{API}/products/{state['product_id']}", headers=h)
        assert r.status_code == 200
        assert r.json()["title"] == "Chips"

    def test_update_product(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        body = {"title": "Chips XL", "description": "Bigger", "price": 75.0, "min_quantity": 2,
                "status": "Limited stock", "group_id": state["group_id"], "image_urls": []}
        r = s.put(f"{API}/products/{state['product_id']}", json=body, headers=h)
        assert r.status_code == 200
        assert r.json()["price"] == 75.0
        assert r.json()["title"] == "Chips XL"

    def test_list_products_with_search(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.get(f"{API}/products", params={"q": "Chips"}, headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_product_auth_required(self, s):
        r = s.get(f"{API}/products")
        assert r.status_code == 401


# ---------- Storefront ----------
class TestStorefront:
    def test_storefront_public(self, s):
        r = s.get(f"{API}/storefront/{HANDLE_A}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["seller"]["handle"] == HANDLE_A
        assert "pin_hash" not in j["seller"]
        assert isinstance(j["products"], list)
        assert any(p["id"] == state["product_id"] for p in j["products"])

    def test_storefront_404(self, s):
        r = s.get(f"{API}/storefront/nonexistent_{UNIQUE}")
        assert r.status_code == 404

    def test_create_buyer_order(self, s):
        body = {"buyer_name": "Buyer One", "buyer_mobile": "+919999999999",
                "buyer_address": "123 Test St",
                "items": [{"product_id": state["product_id"], "quantity": 3}]}
        r = s.post(f"{API}/storefront/{HANDLE_A}/orders", json=body)
        assert r.status_code == 200, r.text
        j = r.json()
        # Product was updated to 75.0; total should be 75*3 = 225
        assert j["total"] == 225.0
        assert j["status"] == "Pending"
        state["order_id"] = j["id"]

    def test_orders_list_authed(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.get(f"{API}/orders", headers=h)
        assert r.status_code == 200
        assert any(o["id"] == state["order_id"] for o in r.json())

    def test_update_order_status(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.put(f"{API}/orders/{state['order_id']}/status", json={"status": "Accepted"}, headers=h)
        assert r.status_code == 200
        r = s.get(f"{API}/orders", headers=h)
        order = next(o for o in r.json() if o["id"] == state["order_id"])
        assert order["status"] == "Accepted"


# ---------- Uploads ----------
class TestUploads:
    def test_presign(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.post(f"{API}/uploads/presign", json={"filename": "test.jpg", "content_type": "image/jpeg"}, headers=h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "upload_url" in j and "key" in j and "public_url" in j
        assert "backblazeb2.com" in j["upload_url"]
        assert "quicksell" in j["upload_url"] or "quicksell" in j["key"] or j["public_url"]


# ---------- Admin ----------
class TestAdmin:
    def test_admin_login_default(self, s):
        r = s.post(f"{API}/admin/login", json={"pin": "0000"})
        assert r.status_code == 200

    def test_admin_login_wrong(self, s):
        r = s.post(f"{API}/admin/login", json={"pin": "1111"})
        assert r.status_code == 401

    def test_admin_settings_get(self, s):
        r = s.get(f"{API}/admin/settings", headers={"x-admin-pin": "0000"})
        assert r.status_code == 200
        assert r.json()["otp_provider"] in ("dev", "twilio")

    def test_admin_settings_unauthorized(self, s):
        r = s.get(f"{API}/admin/settings", headers={"x-admin-pin": "wrong"})
        assert r.status_code == 401

    def test_admin_settings_update_provider(self, s):
        r = s.put(f"{API}/admin/settings", json={"otp_provider": "dev"}, headers={"x-admin-pin": "0000"})
        assert r.status_code == 200


# ---------- Cleanup ----------
class TestCleanup:
    def test_delete_product(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.delete(f"{API}/products/{state['product_id']}", headers=h)
        assert r.status_code == 200
        r = s.get(f"{API}/products/{state['product_id']}", headers=h)
        assert r.status_code == 404

    def test_delete_group(self, s):
        h = {"Authorization": f"Bearer {state['token_a']}"}
        r = s.delete(f"{API}/groups/{state['group_id']}", headers=h)
        assert r.status_code == 200
