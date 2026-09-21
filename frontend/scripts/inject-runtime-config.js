#!/usr/bin/env node
/**
 * Inject <script src="/config.js"> into the exported index.html.
 *
 * Why this exists: with `web.output: "single"` in app.json, Expo generates
 * index.html from its own internal template and ignores app/+html.tsx entirely.
 * A script tag added there never reaches the build, so the runtime config file
 * would be shipped but never loaded — and the app would silently fall back to
 * same-origin, which is wrong whenever the API is on another host.
 *
 * Runs after `expo export`. Idempotent: if the tag is already present (which it
 * would be if you switch app.json to `output: "static"`, where +html.tsx *is*
 * honoured), nothing changes.
 *
 * The tag is inserted before the app bundle and deliberately without `defer`, so
 * window.__QUICKSTORE_CONFIG__ is set before src/config.ts reads it.
 */

const fs = require("fs");
const path = require("path");

const DIST = process.env.EXPO_WEB_OUTPUT_DIR || path.join(__dirname, "..", "dist");
const INDEX = path.join(DIST, "index.html");
const CONFIG = path.join(DIST, "config.js");
const TAG = '<script src="/config.js"></script>';

function fail(message) {
  console.error(`inject-runtime-config: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(INDEX)) {
  fail(`${INDEX} not found — run \`expo export --platform web\` first.`);
}

if (!fs.existsSync(CONFIG)) {
  // public/config.js should have been copied here by the export. If it is
  // missing, the app would 404 on /config.js, so stop rather than ship that.
  fail(
    `${CONFIG} not found — expected public/config.js to be copied into the export. ` +
      "Check that frontend/public/config.js exists."
  );
}

let html = fs.readFileSync(INDEX, "utf8");

if (html.includes('src="/config.js"')) {
  console.log("inject-runtime-config: already present, nothing to do");
  process.exit(0);
}

// Prefer inserting just before the bundle script; fall back to </head>.
const bundleMatch = html.match(/<script src="\/_expo\/[^"]+"[^>]*><\/script>/);
if (bundleMatch) {
  html = html.replace(bundleMatch[0], `${TAG}\n    ${bundleMatch[0]}`);
} else if (html.includes("</head>")) {
  html = html.replace("</head>", `  ${TAG}\n  </head>`);
} else {
  fail("could not find an insertion point in index.html");
}

fs.writeFileSync(INDEX, html);
console.log("inject-runtime-config: added /config.js to index.html");
