# QuickSell web frontend — Expo web export served by Nginx
#
# Build:  docker build -t quickstore-frontend ./frontend
# Run:    docker run -p 8080:80 quickstore-frontend
#
# The bundle contains no backend URL: /config.js is read at runtime (see
# public/config.js) and /api is proxied to the backend by nginx.conf. That means
# this image is built once and deployed to any environment unchanged.
#
# To bake a backend URL in instead (e.g. to point at an API on another domain):
#     docker build --build-arg EXPO_PUBLIC_BACKEND_URL=https://api.example.com ./frontend

# --------------------------------------------------------------------------
# Stage 1: build the static web bundle
# --------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

ENV CI=1
WORKDIR /app

# Dependencies first so source edits do not re-run the install.
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY . .

# Optional: compile a backend URL into the bundle. Left empty, the app resolves
# the API at runtime from /config.js or the current origin.
ARG EXPO_PUBLIC_BACKEND_URL=""
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL

# Cap Metro's workers so the build does not get OOM-killed on a small CI runner.
ENV METRO_MAX_WORKERS=2

RUN yarn build:web

# --------------------------------------------------------------------------
# Stage 2: serve it
# --------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

# The config is a template: docker-entrypoint.sh substitutes BACKEND_ORIGIN into
# it at container start, so one image works against any backend host.
COPY nginx.conf /etc/nginx/templates/default.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Where /api/ is proxied. Override for a backend not reachable at backend:8000.
ENV BACKEND_ORIGIN=http://backend:8000

# Optionally rewrite config.js at start-up to point the app at an API on another
# origin. Leave unset to use the /api proxy on this same origin.
ENV FRONTEND_BACKEND_URL=""

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
