# QuickSell

A mobile-first store app: sellers manage a catalogue and orders from a React
Native (Expo) app, buyers browse a public storefront page and place orders.

- **Backend** — FastAPI + MongoDB, in `backend/`
- **Frontend** — Expo / React Native (iOS, Android, web), in `frontend/`

The stack is plain and portable: the only external service it requires is a
MongoDB instance. Image storage can be a directory on disk, so a full deployment
needs no cloud accounts at all.

---

## Quick start with Docker

The fastest path from clone to running app.

```bash
cp .env.example .env
python3 -c 'import secrets; print("JWT_SECRET=" + secrets.token_urlsafe(48))' >> .env
# then delete the empty JWT_SECRET= line that came from .env.example

docker compose up -d --build
```

Open <http://localhost:8080>. Sign in with any phone number and OTP `123456`
(sign-in is in dev mode until you connect an SMS provider — see
[Sign-in](#sign-in-and-otp)).

This starts three containers: MongoDB, the API, and Nginx serving the web app
with `/api` proxied to the API. Uploaded images go to a Docker volume.

```bash
docker compose logs -f backend    # follow the API logs
docker compose down               # stop (volumes and data are kept)
docker compose down -v            # stop and delete the database and images
```

---

## Running without Docker

### Backend

Needs Python 3.11+ and a reachable MongoDB.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env              # works as-is for local development
uvicorn server:app --reload --port 8000
```

Check it: <http://localhost:8000/api/health> → `{"ok": true, ...}`.

With no configuration at all it uses `mongodb://localhost:27017`, database
`quicksell`, and stores images in `backend/media/`.

### Frontend

Needs Node 20+ and Yarn.

```bash
cd frontend
yarn install
yarn web                          # browser
yarn ios                          # iOS simulator
yarn android                      # Android emulator or device
yarn start                        # Expo Go, scan the QR code
```

No configuration needed for local development: on web the app calls `/api` on
the current origin, and on a device it points at the Expo dev server's host on
port 8000. Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to override.

---

## Configuration

Every setting is an environment variable, documented in full in
**`backend/.env.example`** and **`frontend/.env.example`**. Nothing is read from
anywhere else, so any platform that can set env vars can run this.

The ones that matter:

| Variable | Required | What it does |
| --- | --- | --- |
| `MONGO_URL` | yes | Any MongoDB: local, Docker, Atlas, DocumentDB |
| `DB_NAME` | yes | Database name (default `quicksell`) |
| `JWT_SECRET` | **in production** | Signs login tokens. App refuses to start in production without it |
| `APP_ENV` | no | `production` enables strict config checks. Default `development` |
| `BACKEND_PUBLIC_URL` | no | Public API base URL. Leave empty when the frontend is same-origin |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. Default `*` |
| `STORAGE_BACKEND` | no | `local` or `s3`. Auto-detected if unset |
| `SERVE_FRONTEND` | no | Path to the built web app, to serve UI + API from one process |

Startup fails fast with a specific, actionable message when something required is
missing, rather than crashing on the first request.

### Image storage

Two interchangeable backends, selected by `STORAGE_BACKEND`:

**`local`** — files on disk under `MEDIA_ROOT`. No cloud account, no credentials.
Mount a persistent volume there; a container's own filesystem does not survive a
restart. Fine for a single host.

**`s3`** — any S3-compatible object store. Set `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, and — for anything that is not AWS S3 —
`S3_ENDPOINT_URL`:

| Provider | `S3_ENDPOINT_URL` |
| --- | --- |
| AWS S3 | *(leave empty)* |
| Backblaze B2 | `https://s3.us-east-005.backblazeb2.com` |
| Cloudflare R2 | `https://<account_id>.r2.cloudflarestorage.com` |
| DigitalOcean Spaces | `https://nyc3.digitaloceanspaces.com` |
| MinIO | `http://minio:9000` (also set `S3_FORCE_PATH_STYLE=true`) |

Use `s3` once you run more than one backend container, since local disk is not
shared between them.

Images are always served through `GET /api/images?key=...`, so buckets stay
private and the URLs stored in the database never expire. The URL is stable, so
you can put a CDN in front of it.

Legacy `B2_*` variable names are still honoured, so an existing Backblaze
deployment keeps working with no environment changes.

---

## Deploying

### Single container (simplest)

Have the backend serve the web app too, so there is one process and one origin:

```bash
cd frontend && yarn install && yarn build:web     # outputs frontend/dist
cd ../backend
APP_ENV=production \
JWT_SECRET=... \
MONGO_URL=mongodb://... \
SERVE_FRONTEND=../frontend/dist \
uvicorn server:app --host 0.0.0.0 --port 8000
```

### A VPS

```bash
git clone <this repo> && cd quickstore
cp .env.example .env && $EDITOR .env      # set JWT_SECRET
docker compose up -d --build
```

Then put a reverse proxy in front for TLS (Caddy, Nginx, or Traefik) pointing at
`localhost:8080`, and set `CORS_ORIGINS` to your domain.

### A managed platform

Render, Fly.io, Railway, Cloud Run, ECS, Azure Container Apps, Heroku, App
Runner:

- **API** — build `backend/Dockerfile`. Set `MONGO_URL`, `JWT_SECRET`,
  `APP_ENV=production`. Health check path `/api/health`. The container honours
  `$PORT`, which is what most of these platforms inject.
- **Database** — MongoDB Atlas has a free tier; point `MONGO_URL` at it.
- **Images** — set `STORAGE_BACKEND=s3` and the `S3_*` variables. Platforms with
  ephemeral filesystems cannot use `local`.
- **Web app** — either serve it from the API with `SERVE_FRONTEND`, or deploy
  `frontend/dist` to any static host (Vercel, Netlify, Cloudflare Pages,
  S3+CloudFront) and set `backendUrl` in its `config.js`.

### Kubernetes

`docker-compose.yml` maps over directly: two Deployments (API, web), a Service
each, a Secret for `JWT_SECRET`, and either a PersistentVolumeClaim at
`MEDIA_ROOT` or `STORAGE_BACKEND=s3`. Wire liveness and readiness probes to
`/api/health`. Run MongoDB with an operator or use a managed instance.

### One build, many environments

The web bundle does **not** have a backend URL compiled into it. It reads
`/config.js` at load time (see `frontend/public/config.js`), so the same artifact
can be promoted from staging to production by changing that one file — or by
setting `FRONTEND_BACKEND_URL` on the frontend container, which rewrites it at
start-up. Leave it empty and the app calls `/api` on its own origin.

Native app binaries have no runtime config file, so they do need
`EXPO_PUBLIC_BACKEND_URL` set at build time.

### Mobile builds

`frontend/app.json` still carries the default Expo `name` and `slug` of
`"frontend"`. Change both before you build for the app stores, and set a real
bundle identifier (`ios.bundleIdentifier`) and package name
(`android.package`). Then build with [EAS](https://docs.expo.dev/build/setup/)
or `expo prebuild` plus Xcode/Gradle if you would rather build locally.

---

## Sign-in and OTP

Sign-in currently runs in **dev mode**: any correctly formatted phone number is
accepted with the OTP in `DEV_OTP_CODE` (default `123456`). This is a shared
password, not authentication — change it and do not leave the app publicly
reachable in this state.

The admin screen has a `twilio` provider option, but the send path is not
implemented (`POST /api/auth/request-otp` returns 503 for it). Wire up a real SMS
provider before any production use.

The admin screen is protected by a separate PIN stored in the database, default
`0000`. Change it on first run.

---

## Tests

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
uvicorn server:app --port 8000 &                 # tests drive a live server
TEST_BASE_URL=http://localhost:8000 pytest tests -v
```

---

## Project layout

```
backend/
  server.py            API routes, models, storefront rendering
  config.py            all configuration, read from the environment
  storage.py           pluggable image storage (local disk / S3-compatible)
  templates/           server-rendered public storefront page
  tests/               end-to-end API tests
  Dockerfile
frontend/
  app/                 screens (expo-router file-based routing)
  src/config.ts        resolves the backend URL at runtime
  src/api/client.ts    fetch wrapper, token handling, image upload
  src/components/      shared UI
  public/config.js     runtime config for web deployments
  Dockerfile, nginx.conf
docker-compose.yml     MongoDB + API + web
```

## API

`GET /api/health` reports database and storage status. Interactive docs are
served at `/docs` (OpenAPI schema at `/openapi.json`) — put those behind
authentication or disable them before exposing the API publicly.
