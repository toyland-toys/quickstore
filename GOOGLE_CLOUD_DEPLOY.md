# Deploying QuickSell to Google Cloud

This app is already container-based (see `backend/Dockerfile`,
`frontend/Dockerfile`), so it maps cleanly onto **Cloud Run**: two stateless
services (API + web), no servers to manage, scale-to-zero, and a free tier
that comfortably covers small stores. This guide uses Cloud Run for compute,
**MongoDB Atlas** for the database (Cloud Run has no built-in Mongo), and
**Google Cloud Storage** for uploaded images (Cloud Run's own filesystem is
ephemeral, so `STORAGE_BACKEND=local` will not survive a redeploy or scale
event).

Total cost for a small deployment: $0 on Cloud Run/Build/Artifact Registry
(free tier) + Atlas free tier (M0, 512MB) + a few cents/month for GCS. You
only pay once traffic is meaningful.

---

## 0. Prerequisites

- A Google Cloud project with billing enabled (billing is required to enable
  the APIs below, but the free tier keeps a small deployment at ~$0).
- The [`gcloud` CLI](https://cloud.google.com/sdk/docs/install), authenticated:

  ```bash
  gcloud auth login
  gcloud config set project YOUR_PROJECT_ID
  ```

- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) account
  (free tier is enough to start).

Enable the services you'll use:

```bash
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com
```

---

## 1. Database — MongoDB Atlas

1. Create a free (M0) cluster.
2. **Database Access** → add a user with a strong password (this app only
   needs read/write on its own database).
3. **Network Access** → add `0.0.0.0/0` (Cloud Run has no fixed egress IP on
   the default setup). If you need to lock this down, use
   [Serverless VPC Access](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)
   with a static IP via Cloud NAT instead.
4. **Connect** → "Drivers" → copy the connection string. It looks like:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net
   ```

   This is your `MONGO_URL`.

---

## 2. Image storage — Google Cloud Storage

The backend's `s3` storage backend works with any S3-compatible API, and GCS
provides one ([interoperability
mode](https://cloud.google.com/storage/docs/interoperability)):

1. Create a bucket:

   ```bash
   gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=us-central1 --uniform-bucket-level-access
   ```

2. Enable HMAC/interoperability access and create a key:
   Cloud Console → **Cloud Storage → Settings → Interoperability** → "Create a
   key" for a service account. This gives you an `Access key` and `Secret`.

3. Set these on the backend:

   ```
   STORAGE_BACKEND=s3
   S3_ACCESS_KEY_ID=<the HMAC access key>
   S3_SECRET_ACCESS_KEY=<the HMAC secret>
   S3_BUCKET=YOUR_BUCKET_NAME
   S3_ENDPOINT_URL=https://storage.googleapis.com
   S3_REGION=auto
   ```

Images are served through `GET /api/images?key=...`, so the bucket itself
never needs to be public.

---

## 3. Build and push the images

Create an Artifact Registry repo once:

```bash
gcloud artifacts repositories create quickstore \
  --repository-format=docker \
  --location=us-central1
```

Build and push both images with Cloud Build (no local Docker needed):

```bash
gcloud builds submit ./backend \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/quickstore/backend:latest

gcloud builds submit ./frontend \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/quickstore/frontend:latest
```

(A ready-made `cloudbuild.yaml` that does both in one command is included in
this repo — see step 6.)

---

## 4. Deploy the backend API to Cloud Run

```bash
gcloud run deploy quickstore-backend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/quickstore/backend:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000 \
  --set-env-vars APP_ENV=production,DB_NAME=quicksell,STORAGE_BACKEND=s3,S3_BUCKET=YOUR_BUCKET_NAME,S3_ENDPOINT_URL=https://storage.googleapis.com,S3_REGION=auto,CORS_ORIGINS=*
```

Then set the secrets separately (so they don't end up in shell history or
`gcloud run services describe` output as plain env vars — using Secret
Manager is the safer path):

```bash
printf '%s' 'mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net' | \
  gcloud secrets create MONGO_URL --data-file=-
printf '%s' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')" | \
  gcloud secrets create JWT_SECRET --data-file=-
printf '%s' '<HMAC access key>' | gcloud secrets create S3_ACCESS_KEY_ID --data-file=-
printf '%s' '<HMAC secret>'     | gcloud secrets create S3_SECRET_ACCESS_KEY --data-file=-

gcloud run services update quickstore-backend \
  --region us-central1 \
  --update-secrets=MONGO_URL=MONGO_URL:latest,JWT_SECRET=JWT_SECRET:latest,S3_ACCESS_KEY_ID=S3_ACCESS_KEY_ID:latest,S3_SECRET_ACCESS_KEY=S3_SECRET_ACCESS_KEY:latest
```

Grab the deployed URL:

```bash
gcloud run services describe quickstore-backend --region us-central1 --format='value(status.url)'
```

Check it: `curl https://<that-url>/api/health` → `{"ok": true, ...}`.

---

## 5. Deploy the web frontend to Cloud Run

The frontend image resolves its backend URL at *runtime* (via
`/config.js` / `FRONTEND_BACKEND_URL`), so the same image works no matter
where the API ends up — set the backend's Cloud Run URL as an env var:

```bash
gcloud run deploy quickstore-frontend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/quickstore/frontend:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --port 80 \
  --set-env-vars FRONTEND_BACKEND_URL=https://<quickstore-backend-url>
```

Grab its URL the same way:

```bash
gcloud run services describe quickstore-frontend --region us-central1 --format='value(status.url)'
```

Open it in a browser and sign in with any phone number + OTP `123456` (dev
mode — see the main README's [Sign-in](README.md#sign-in-and-otp) section
before going live).

Finally, tighten CORS now that you know the real frontend origin:

```bash
gcloud run services update quickstore-backend \
  --region us-central1 \
  --update-env-vars CORS_ORIGINS=https://<quickstore-frontend-url>
```

---

## 6. One-command redeploys (optional)

`cloudbuild.yaml` at the repo root builds and deploys both services in one
step. After the one-time setup above (Artifact Registry repo, secrets
created), redeploy with:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_BUCKET=YOUR_BUCKET_NAME
```

Wire this into a Cloud Build trigger on your git repo for deploy-on-push.

---

## 7. Custom domain (optional)

```bash
gcloud beta run domain-mappings create \
  --service quickstore-frontend \
  --domain shop.example.com \
  --region us-central1
```

Follow the printed DNS instructions, then set `FRONTEND_SHOP_ORIGIN` on the
frontend service to that domain so storefront links are always correct:

```bash
gcloud run services update quickstore-frontend \
  --region us-central1 \
  --update-env-vars FRONTEND_SHOP_ORIGIN=https://shop.example.com
```

---

## 8. Before going live

- Wire up a real SMS provider (Twilio config in `backend/.env.example`) —
  sign-in is dev-mode (shared OTP) until then.
- Change the admin PIN (default `0000`) from the in-app admin screen.
- Put `/docs` and `/openapi.json` behind auth or disable them
  (`SERVE_DOCS=false` if present, or a reverse-proxy rule) before exposing
  the API publicly.
- Consider Cloud Run min-instances=1 on the backend if cold starts (scale
  from zero) are noticeable for your traffic pattern.
