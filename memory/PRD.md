# QuickStore Seller — Product Requirements (MVP)

## Goal
Mobile app for B2B toy sellers to manage micro-storefronts (catalog, orders, branding) similar to QuickSell.co. Each seller gets a unique handle that maps to a public storefront URL (`yourdomain.com/<handle>`).

## Implemented (MVP)
- **Phone + OTP signup/login** (FastAPI). DEV mode is ON: any number works with code `123456`. Twilio toggle scaffold present in Admin screen.
- **4-digit PIN lock** with bcrypt hash; iOS-style numpad for setup, confirm, and unlock.
- **Handle reservation** with live availability checking. URL preview shown.
- **Product CRUD**: title, description, price, MOQ, stock status (4 states), group, 1-5 images.
- **Image upload** via Backblaze B2 S3-compatible presigned PUT URLs (configured: bucket `quicksell`, region `us-east-005`).
- **Product groups** (catalogs) — create / delete / assign.
- **Storefront customization**: title, tagline, brand color (8 swatches), WhatsApp number.
- **Buyer storefront preview** — mock browser frame showing exact buyer-side view, with brand banner, group chips, product grid.
- **Orders inbox** — Pending / Accepted / Shipped tabs; accept, decline, mark-shipped actions.
- **Admin screen** with default PIN `0000`: toggle OTP provider (dev/twilio scaffold), change admin PIN.
- **Public storefront API** (`/api/storefront/{handle}`) and **buyer order submission** (`/api/storefront/{handle}/orders`).

## Architecture
- **Frontend**: Expo Router (file-based), 4 bottom tabs (Home, Catalog, Orders, Store), Ionicons, terracotta `#C25B4E` brand on crisp surface.
- **Backend**: FastAPI + Motor (MongoDB) + JWT auth + boto3 (B2 S3-compatible) + bcrypt for PINs.
- **Routes**: All API prefixed with `/api`. JWT via `Authorization: Bearer`. Admin endpoints via `x-admin-pin` header.

## Not in MVP (deferred)
- Twilio SMS (scaffold only; needs Twilio Account SID/Auth Token/Verify Service SID)
- Push notifications
- PDF quotation generation
- WhatsApp deep-link order handoff
- Biometric unlock

## Key files
- `backend/server.py` — all routes
- `frontend/app/onboarding/*` — phone → OTP → PIN → handle
- `frontend/app/(tabs)/*` — main 4 tabs
- `frontend/app/product/*` — product create/edit
- `frontend/app/storefront-preview.tsx` — buyer preview
- `frontend/app/admin.tsx` — SMS toggle + admin PIN

## Smart business enhancement
The buyer-side storefront preview is a **shareable link** — sellers can copy & share their unique URL (terracotta-tinted card on Store tab); this is the core viral acquisition loop (each new B2B buyer becomes a potential seller).
