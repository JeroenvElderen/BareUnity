"use client";

type PrefetchKey =
  | "homefeed"
  | "gallery-snapshot"
  | "map-spots";

type PrefetchedEntry<T> = {
  value: T;
  expiresAt: number;
};

const PREFETCH_TTL_MS = 30_000;

declare global {
  interface Window {
    __bareunityPrefetchedRouteData?: Partial<Record<PrefetchKey, PrefetchedEntry<unknown>>>;
  }
}

function readStore() {
  if (typeof window === "undefined") return null;
  if (!window.__bareunityPrefetchedRouteData) {
    window.__bareunityPrefetchedRouteData = {};
  }
  return window.__bareunityPrefetchedRouteData;
}

export function setPrefetchedRouteData<T>(key: PrefetchKey, value: T, ttlMs: number = PREFETCH_TTL_MS) {
  const store = readStore();
  if (!store) return;
  store[key] = {
    value,
    expiresAt: Date.now() + ttlMs,
  };
}

export function takePrefetchedRouteData<T>(key: PrefetchKey): T | null {
  const store = readStore();
  if (!store) return null;
  const entry = store[key];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete store[key];
    return null;
  }
  delete store[key];
  return entry.value as T;
}
