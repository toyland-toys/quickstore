// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { FileStore } = require("metro-cache");

const config = getDefaultConfig(__dirname);

// Stable on-disk cache, shared across web/android/ios builds.
// Override the location with METRO_CACHE_ROOT (useful in CI, where you may want
// to point this at a cached directory between runs).
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, ".metro-cache");
config.cacheStores = [new FileStore({ root: path.join(root, "cache") })];

// Worker count. Metro defaults to (cpus - 1), which is what you want on a normal
// machine or CI runner. Set METRO_MAX_WORKERS to cap it on a small container.
if (process.env.METRO_MAX_WORKERS) {
  config.maxWorkers = Number(process.env.METRO_MAX_WORKERS);
}

module.exports = config;
