#!/usr/bin/env node
/**
 * Patch the exported index.html for things app/+html.tsx cannot reach.
 *
 * Why this exists: with `web.output: "single"` in app.json, Expo generates
 * index.html from its own internal template and ignores app/+html.tsx entirely.
 * Anything added there — a script tag, a meta tag, a style override — never
 * reaches the build. This runs after `expo export` and patches the real
 * generated file instead. Idempotent: every patch below checks for its own
 * marker first, so re-running (or switching app.json to `output: "static"`,
 * where +html.tsx *is* honoured and would already contain this content) is a
 * no-op.
 *
 * Patches:
 *   1. Inject <script src="/config.js">, without `defer`, so runtime config is
 *      set before the app bundle reads it. Without this, config.js would ship
 *      but never load, and the app would silently fall back to same-origin.
 *   2. Add `viewport-fit=cover` to the viewport meta tag, and drive
 *      html/body's height from 100dvh (falling back to plain 100%) instead of
 *      a plain height:100%. A plain percentage resolves against the *layout*
 *      viewport, which some mobile browsers keep taller than what is actually
 *      visible around a collapsible address/toolbar — hiding fixed-position UI
 *      (like the tab bar) behind that chrome; 100dvh tracks the real visible
 *      height instead.
 *
 *      An earlier version of this patch also set a JS-measured --app-vh
 *      custom property from the VisualViewport API, on top of 100dvh, to
 *      cover browsers with unreliable dvh support. Removed: Chrome DevTools'
 *      device-toolbar emulation doesn't always report visualViewport.height
 *      as the full emulated screen height, so that JS layer could make the
 *      root shorter than the real viewport there, leaving a visible gap at
 *      the bottom — a regression worse than the dvh-unsupported case it was
 *      meant to cover, given how widely supported dvh already is.
 */

const fs = require("fs");
const path = require("path");

const DIST = process.env.EXPO_WEB_OUTPUT_DIR || path.join(__dirname, "..", "dist");
const INDEX = path.join(DIST, "index.html");
const CONFIG = path.join(DIST, "config.js");
const CONFIG_TAG = '<script src="/config.js"></script>';

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
let changed = false;

// --- 1. Runtime backend config script -------------------------------------

if (html.includes('src="/config.js"')) {
  console.log("inject-runtime-config: config.js tag already present, skipping");
} else {
  const bundleMatch = html.match(/<script src="\/_expo\/[^"]+"[^>]*><\/script>/);
  if (bundleMatch) {
    html = html.replace(bundleMatch[0], `${CONFIG_TAG}\n    ${bundleMatch[0]}`);
  } else if (html.includes("</head>")) {
    html = html.replace("</head>", `  ${CONFIG_TAG}\n  </head>`);
  } else {
    fail("could not find an insertion point for the config.js tag in index.html");
  }
  console.log("inject-runtime-config: added /config.js tag");
  changed = true;
}

// --- 2. viewport-fit=cover ---------------------------------------------------

const viewportMatch = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"\s*\/>/);
if (!viewportMatch) {
  fail("could not find the viewport meta tag in index.html");
} else if (viewportMatch[1].includes("viewport-fit")) {
  console.log("inject-runtime-config: viewport-fit already present, skipping");
} else {
  html = html.replace(
    viewportMatch[0],
    `<meta name="viewport" content="${viewportMatch[1]}, viewport-fit=cover" />`
  );
  console.log("inject-runtime-config: added viewport-fit=cover");
  changed = true;
}

// --- 3. 100dvh-driven height instead of plain height:100% ------------------

const DVH_MARKER = "100dvh";
if (html.includes(DVH_MARKER)) {
  console.log("inject-runtime-config: dvh height fix already present, skipping");
} else {
  const resetStyleMatch = html.match(/<style id="expo-reset">[\s\S]*?<\/style>/);
  if (!resetStyleMatch) {
    fail("could not find the #expo-reset style block in index.html");
  }
  const patchedStyle = resetStyleMatch[0].replace(
    /html,\s*\n\s*body\s*\{\s*\n\s*height:\s*100%;\s*\n\s*\}/,
    `html,\n      body {\n        height: 100%;\n        height: ${DVH_MARKER};\n      }`
  );
  if (patchedStyle === resetStyleMatch[0]) {
    fail("could not locate the html/body height rule inside #expo-reset to patch");
  }
  html = html.replace(resetStyleMatch[0], patchedStyle);
  console.log("inject-runtime-config: added dvh height fix");
  changed = true;
}

if (changed) {
  fs.writeFileSync(INDEX, html);
} else {
  console.log("inject-runtime-config: nothing to do");
}
