export type ClientCachePayload<T> = {
  data: T;
  savedAt: number;
};

const ACTIVE_CACHE_USER_KEY = "cache:active-user:v1";
const USER_SCOPED_CACHE_VERSION = "v2";
const CLIENT_CACHE_ENABLED = true;

type ReadCachedValueOptions = {
  maxAgeMs: number;
  allowExpired?: boolean;
};

function readCachedPayload<T>(key: string): ClientCachePayload<T> | null {
  if (!CLIENT_CACHE_ENABLED) return null;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ClientCachePayload<T>>;
    if (typeof parsed?.savedAt !== "number" || !Number.isFinite(parsed.savedAt) || !("data" in parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }

    return {
      data: parsed.data as T,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function readCachedValue<T>(key: string, options: number | ReadCachedValueOptions): T | null {
  if (!CLIENT_CACHE_ENABLED) {
    void key;
    void options;
    return null;
  }
  const resolvedOptions: ReadCachedValueOptions =
    typeof options === "number" ? { maxAgeMs: options } : options;
  const parsed = readCachedPayload<T>(key);
  if (!parsed) return null;

  const isExpired = Date.now() - parsed.savedAt > resolvedOptions.maxAgeMs;
  if (!isExpired) return parsed.data;

  if (resolvedOptions.allowExpired) {
    return parsed.data;
  }

  removeCachedValue(key);
  return null;
}

export function hasFreshCachedValue(key: string, maxAgeMs: number) {
  if (!CLIENT_CACHE_ENABLED) {
    void key;
    void maxAgeMs;
    return false;
  }
  const parsed = readCachedPayload(key);
  if (!parsed) return false;
  return Date.now() - parsed.savedAt <= maxAgeMs;
}

export function setActiveCacheUser(userId: string | null) {
  if (typeof window === "undefined") return;

  try {
    if (!userId) {
      window.localStorage.removeItem(ACTIVE_CACHE_USER_KEY);
      return;
    }

    window.localStorage.setItem(ACTIVE_CACHE_USER_KEY, userId);
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}

export function getActiveCacheUser() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(ACTIVE_CACHE_USER_KEY);
    const normalized = stored?.trim();
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

export function buildUserScopedCacheKey(scope: string, userId?: string | null) {
  const resolvedUserId = userId ?? getActiveCacheUser() ?? "anon";
  return `${scope}:${resolvedUserId}:${USER_SCOPED_CACHE_VERSION}`;
}

export function writeCachedValue<T>(key: string, data: T) {
  if (!CLIENT_CACHE_ENABLED) {
    void key;
    void data;
    return;
  }
  if (typeof window === "undefined") return;

  const payload: ClientCachePayload<T> = {
    data,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}

export function removeCachedValue(key: string) {
  if (!CLIENT_CACHE_ENABLED) {
    void key;
    return;
  }
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable in private mode / strict browser settings.
  }
}

export function evictCachedValuesByPrefix(prefix: string) {
  if (!CLIENT_CACHE_ENABLED) {
    void prefix;
    return;
  }
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      window.localStorage.removeItem(key);
    }
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
  if (!CLIENT_CACHE_ENABLED) {
    void options.key;
    void options.maxAgeMs;
    void options.onCachedData;
    return options.fetchFresh();
  }
  
  const cached = readCachedValue<T>(options.key, options.maxAgeMs);

  if (cached && options.onCachedData) {
    options.onCachedData(cached);
  }

  const fresh = await options.fetchFresh();
  writeCachedValue(options.key, fresh);
  return fresh;
}
