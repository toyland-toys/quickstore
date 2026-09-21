import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config';

const KEY = 'qs_token';
const USER_KEY = 'qs_user';
const ADMIN_PIN_KEY = 'qs_admin_pin';

const safeStore = {
  async get(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async del(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

// Resolved in src/config.ts: runtime override, then build-time env var, then the
// current origin on web, then the Expo dev host. '' means "this origin".
const BASE = BACKEND_URL;

let tokenCache: string | null = null;
let adminPinCache: string | null = null;

export async function loadToken() {
  if (tokenCache) return tokenCache;
  tokenCache = (await safeStore.get(KEY)) || null;
  return tokenCache;
}

export async function setToken(t: string) {
  tokenCache = t;
  await safeStore.set(KEY, t);
}

export async function clearToken() {
  tokenCache = null;
  await safeStore.del(KEY);
  await safeStore.del(USER_KEY);
}

export async function setAdminPin(p: string) {
  adminPinCache = p;
  await safeStore.set(ADMIN_PIN_KEY, p);
}
export async function getAdminPin() {
  if (adminPinCache) return adminPinCache;
  adminPinCache = (await safeStore.get(ADMIN_PIN_KEY)) || null;
  return adminPinCache;
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (opts.auth !== false) {
    const t = await loadToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { detail: text };
  }
  if (!res.ok) {
    const msg = json?.detail || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return json as T;
}

/**
 * PUT an image to a presigned upload URL from POST /api/uploads/presign.
 *
 * Storage-agnostic: that URL points at whatever object store the backend is
 * configured with (S3, B2, R2, MinIO, Spaces), or back at the backend's own
 * /api/uploads/direct endpoint when it stores files on local disk. This client
 * does not need to know which.
 */
export async function uploadImage(uploadUrl: string, uri: string, contentType: string) {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  // A local-storage backend with no BACKEND_PUBLIC_URL configured returns a
  // root-relative upload URL. Browsers resolve that against the current origin,
  // but React Native's fetch requires an absolute URL, so resolve it here.
  const target = uploadUrl.startsWith('/') ? `${BASE}${uploadUrl}` : uploadUrl;
  const put = await fetch(target, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!put.ok) {
    const t = await put.text();
    throw new Error(`Upload failed (${put.status}): ${t.slice(0, 120)}`);
  }
}

/** @deprecated Storage is no longer Backblaze-specific — use uploadImage. */
export const uploadToB2 = uploadImage;
