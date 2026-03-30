type CachedValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export async function readServerCache<T extends CachedValue>(args: {
  userId: string;
  scope: string;
  key: string;
}) {
  void args;
  return null as {
    value: T;
    sourceVersion: string;
    updatedAt: Date;
    cacheTag: string;
  } | null;
}

export async function writeServerCache<T extends CachedValue>(args: {
  userId: string;
  scope: string;
  key: string;
  value: T;
  sourceVersion: string;
  ttlSeconds?: number;
}) {
  void args;
}

export async function deleteServerCache(args: { userId: string; scope: string; key: string }) {
  void args;
}
