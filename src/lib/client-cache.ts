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

export function removeCachedValue(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}

export function evictCachedValuesByPrefix(prefix: string) {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith(prefix)) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}

export async function loadCachedThenRefresh<T>(options: {
  key: string;
  maxAgeMs: number;
  fetchFresh: () => Promise<T>;
  onCachedData?: (data: T) => void;
}): Promise<T> {
  const cached = readCachedValue<T>(options.key, options.maxAgeMs);

  if (cached && options.onCachedData) {
    options.onCachedData(cached);
  }

  const fresh = await options.fetchFresh();
  writeCachedValue(options.key, fresh);
  return fresh;
}
