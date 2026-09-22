/**
 * Where the backend lives.
 *
 * Resolved once, at first use, from the first of these that yields a value:
 *
 *  1. A runtime override on web: `window.__QUICKSTORE_CONFIG__.backendUrl`,
 *     normally set by a small `config.js` served next to the app. This lets ONE
 *     built bundle be deployed to staging, production, a customer's own server,
 *     or a preview host without rebuilding — edit config.js, reload.
 *  2. `EXPO_PUBLIC_BACKEND_URL`, inlined at build time by Expo. Still the right
 *     choice for native app binaries, where there is no runtime config file.
 *  3. Same origin, on web. If the backend serves the built web app itself (see
 *     SERVE_FRONTEND in the backend config), the API is simply on this host and
 *     no configuration is needed at all.
 *  4. The Expo dev server's host, during native development. A phone running the
 *     app over LAN can then reach the backend on the dev machine without anyone
 *     hand-editing an IP address.
 *
 * An empty string is a valid, working answer on web: it produces root-relative
 * requests like `/api/products`, which hit the current origin.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Shape of the optional runtime config file (web deployments). */
type RuntimeConfig = { backendUrl?: string; shopOrigin?: string };

declare global {
  // eslint-disable-next-line no-var
  var __QUICKSTORE_CONFIG__: RuntimeConfig | undefined;
}

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/** Port the backend listens on during local development. */
const DEV_BACKEND_PORT = process.env.EXPO_PUBLIC_DEV_BACKEND_PORT || '8000';

/** 1. Runtime override, web only. */
function fromRuntimeConfig(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const configured = window.__QUICKSTORE_CONFIG__?.backendUrl;
  // A placeholder left unreplaced in config.js should not be treated as a URL.
  if (typeof configured !== 'string' || !configured || configured.startsWith('__')) {
    return null;
  }
  return stripTrailingSlash(configured);
}

/** 2. Build-time environment variable. */
function fromBuildEnv(): string | null {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!configured) return null;
  return stripTrailingSlash(configured);
}

/** 3. Same origin (web). Returns '' so requests come out root-relative. */
function fromSameOrigin(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return '';
}

/**
 * 4. The machine running `expo start`, for native development.
 *
 * Expo exposes the dev server as host:port; the backend is assumed to be on the
 * same host at DEV_BACKEND_PORT. Only ever consulted in dev builds.
 */
function fromExpoDevHost(): string | null {
  if (!__DEV__) return null;
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host) return null;
  return `http://${host}:${DEV_BACKEND_PORT}`;
}

function resolveBackendUrl(): string {
  const resolvers = [fromRuntimeConfig, fromBuildEnv, fromSameOrigin, fromExpoDevHost];
  for (const resolve of resolvers) {
    const value = resolve();
    if (value !== null) return value;
  }
  return '';
}

/**
 * Base URL for API calls — no trailing slash, and '' means "this origin".
 * Build request URLs as `${BACKEND_URL}/api/...`.
 */
export const BACKEND_URL: string = resolveBackendUrl();

/** Absolute (or root-relative) URL for an API path such as '/api/products'. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${suffix}`;
}

/**
 * Origin buyers should use for a seller's public storefront.
 *
 * Resolved from the first of these that yields a value:
 *
 *  1. A runtime override on web: `window.__QUICKSTORE_CONFIG__.shopOrigin`,
 *     set the same way as backendUrl above (via config.js / FRONTEND_SHOP_ORIGIN
 *     at container start). Pin this to the canonical public domain (e.g.
 *     "https://nowsell.online") once one is mapped, so the link shown and
 *     copied is always that domain — even for a seller who reaches the app via
 *     a different working origin, such as the platform's own onrender.com URL
 *     left reachable alongside a mapped custom domain.
 *  2. The current origin, on web. nginx (see frontend/nginx.conf) proxies a
 *     bare "/{handle}" on this same origin to the backend's storefront route,
 *     so absent an explicit override, whatever domain the seller is viewing
 *     the app from already works for buyers too -- correct by default on a
 *     preview deploy or before a custom domain exists, with nothing to
 *     configure.
 *  3. The backend's own /api/shop route directly. Native builds have no
 *     "current origin" a buyer would ever visit, so this is also the fallback
 *     there.
 */
export function publicShopOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const configured = window.__QUICKSTORE_CONFIG__?.shopOrigin;
    if (typeof configured === 'string' && configured && !configured.startsWith('__')) {
      return stripTrailingSlash(configured);
    }
    if (window.location?.origin) return window.location.origin;
  }
  return `${BACKEND_URL}/api/shop`;
}

/** publicShopOrigin() without the scheme, for compact on-screen display. */
export function publicShopOriginDisplay(): string {
  return publicShopOrigin().replace(/^https?:\/\//, '');
}
