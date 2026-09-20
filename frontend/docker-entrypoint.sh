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

# If a runtime backend URL was provided, write it into config.js so the bundle
# picks it up on load. Leave it alone otherwise: the default empty value means
# "same origin", which is what the /api proxy above already provides.
if [ -n "$FRONTEND_BACKEND_URL" ]; then
  printf 'window.__QUICKSTORE_CONFIG__ = { backendUrl: "%s" };\n' \
    "$FRONTEND_BACKEND_URL" > /usr/share/nginx/html/config.js
  echo "config.js: backendUrl set to $FRONTEND_BACKEND_URL"
fi

exec nginx -g 'daemon off;'
