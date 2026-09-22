#!/bin/sh
# Container start-up for the Nginx-served web app.
#
# Substitutes BACKEND_ORIGIN into the Nginx config, then hands over to Nginx.
# Only that one variable is substituted, so Nginx's own $host, $remote_addr and
# friends survive untouched.
set -e

TEMPLATE=/etc/nginx/templates/default.conf
TARGET=/etc/nginx/conf.d/default.conf

: "${BACKEND_ORIGIN:=http://backend:8000}"
export BACKEND_ORIGIN

envsubst '$BACKEND_ORIGIN' < "$TEMPLATE" > "$TARGET"

echo "nginx: proxying /api/ to $BACKEND_ORIGIN"

# If a runtime backend URL and/or a canonical public shop origin were
# provided, write them into config.js so the bundle picks them up on load.
# Built up field by field so setting only one doesn't blank out the other.
# Leave config.js alone (its checked-in default) if neither is set: an empty
# backendUrl means "same origin", which is what the /api proxy above already
# provides, and no shopOrigin means "use the current origin", which src/config.ts
# falls back to on its own.
CONFIG_FIELDS=""
if [ -n "$FRONTEND_BACKEND_URL" ]; then
  CONFIG_FIELDS="${CONFIG_FIELDS}backendUrl: \"$FRONTEND_BACKEND_URL\", "
  echo "config.js: backendUrl set to $FRONTEND_BACKEND_URL"
fi
if [ -n "$FRONTEND_SHOP_ORIGIN" ]; then
  CONFIG_FIELDS="${CONFIG_FIELDS}shopOrigin: \"$FRONTEND_SHOP_ORIGIN\", "
  echo "config.js: shopOrigin set to $FRONTEND_SHOP_ORIGIN"
fi
if [ -n "$CONFIG_FIELDS" ]; then
  printf 'window.__QUICKSTORE_CONFIG__ = { %s};\n' "$CONFIG_FIELDS" > /usr/share/nginx/html/config.js
fi

exec nginx -g 'daemon off;'
