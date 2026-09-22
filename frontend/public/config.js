/*
 * Runtime configuration for the web build.
 *
 * Expo copies everything in `public/` to the root of the web output, so this file
 * ends up at /config.js next to index.html and is loaded before the app bundle.
 *
 * The point of it is that the same built bundle can be deployed anywhere. Change
 * the value here on the server (or overwrite the file at container start, or mount
 * it as a ConfigMap) and reload the page — no rebuild needed.
 *
 * Leave backendUrl as an empty string when the API is served from the same origin
 * as this app, which is the case when the backend runs with SERVE_FRONTEND set, or
 * when a reverse proxy routes /api to the backend. Requests then go to /api/... on
 * the current host, which is what you want in most deployments.
 *
 * Set it to an absolute URL when the API lives somewhere else:
 *     window.__QUICKSTORE_CONFIG__ = { backendUrl: "https://api.example.com" };
 *
 * shopOrigin pins the canonical public domain shown/copied for a seller's
 * storefront link (see src/config.ts). Leave it unset to fall back to
 * whatever origin the app is currently being viewed from -- correct by
 * default, but once a custom domain is mapped, sellers browsing the app via
 * another still-reachable origin (e.g. the platform's own onrender.com URL)
 * would otherwise see and copy links on that origin instead:
 *     window.__QUICKSTORE_CONFIG__ = { shopOrigin: "https://nowsell.online" };
 *
 * Note: this is public, client-visible configuration. Never put a secret here.
 */
window.__QUICKSTORE_CONFIG__ = {
  backendUrl: "",
  shopOrigin: "",
};
