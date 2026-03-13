export type ClientCachePayload<T> = {
  data: T;
  savedAt: number;
};

export function readCachedValue<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ClientCachePayload<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;

    const isExpired = Date.now() - parsed.savedAt > maxAgeMs;
    if (isExpired) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedValue<T>(key: string, data: T) {
  if (typeof window === "undefined") return;

  try {
    const payload: ClientCachePayload<T> = {
      data,
      savedAt: Date.now(),
    };

    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}