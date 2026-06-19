import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

export async function uploadToB2(uploadUrl: string, uri: string, contentType: string) {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!put.ok) {
    const t = await put.text();
    throw new Error(`Upload failed (${put.status}): ${t.slice(0, 120)}`);
  }
}
