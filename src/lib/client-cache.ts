export type ClientCachePayload<T> = {
  data: T;
  savedAt: number;
};

const ACTIVE_CACHE_USER_KEY = "cache:active-user:v1";
const USER_SCOPED_CACHE_VERSION = "v2";

type ReadCachedValueOptions = {
  maxAgeMs: number;
  allowExpired?: boolean;
};

function readCachedPayload<T>(key: string): ClientCachePayload<T> | null {
  void key;
  return null;
}

export function readCachedValue<T>(key: string, options: number | ReadCachedValueOptions): T | null {
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
  void key;
  void maxAgeMs;
  return false;
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
  void key;
  void data;
}

export function removeCachedValue(key: string) {
  void key;
}

export function evictCachedValuesByPrefix(prefix: string) {
  void prefix;
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
