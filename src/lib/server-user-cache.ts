import { db } from "@/server/db";

const DEFAULT_TTL_SECONDS = 60 * 10;

type CachedValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

function buildCompositeKey(scope: string, key: string) {
  return `${scope}:${key}`;
}

export async function readServerCache<T extends CachedValue>(args: {
  userId: string;
  scope: string;
  key: string;
}) {
  const cacheRow = await db.user_cache_entries.findUnique({
    where: {
      user_id_cache_scope_cache_key: {
        user_id: args.userId,
        cache_scope: args.scope,
        cache_key: args.key,
      },
    },
  });

  if (!cacheRow?.payload) return null;

  const isExpired = cacheRow.expires_at ? cacheRow.expires_at.getTime() < Date.now() : false;
  if (isExpired) return null;

  return {
    value: cacheRow.payload as T,
    sourceVersion: cacheRow.source_version,
    updatedAt: cacheRow.updated_at,
    cacheTag: buildCompositeKey(args.scope, args.key),
  };
}

export async function writeServerCache<T extends CachedValue>(args: {
  userId: string;
  scope: string;
  key: string;
  value: T;
  sourceVersion: string;
  ttlSeconds?: number;
}) {
  const ttlSeconds = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  await db.user_cache_entries.upsert({
    where: {
      user_id_cache_scope_cache_key: {
        user_id: args.userId,
        cache_scope: args.scope,
        cache_key: args.key,
      },
    },
    create: {
      user_id: args.userId,
      cache_scope: args.scope,
      cache_key: args.key,
      payload: args.value,
      source_version: args.sourceVersion,
      expires_at: new Date(Date.now() + ttlSeconds * 1000),
    },
    update: {
      payload: args.value,
      source_version: args.sourceVersion,
      expires_at: new Date(Date.now() + ttlSeconds * 1000),
      updated_at: new Date(),
    },
  });
}

export async function deleteServerCache(args: { userId: string; scope: string; key: string }) {
  await db.user_cache_entries.deleteMany({
    where: {
      user_id: args.userId,
      cache_scope: args.scope,
      cache_key: args.key,
    },
  });
}