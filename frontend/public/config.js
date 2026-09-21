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
 * Note: this is public, client-visible configuration. Never put a secret here.
 */
window.__QUICKSTORE_CONFIG__ = {
  backendUrl: "",
};
