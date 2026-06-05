import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function ensurePoolerParam(params: URLSearchParams, key: string, value: string) {
  if (!params.has(key)) {
    params.set(key, value);
  }
}

export function withPgBouncerParams(url?: string) {
  if (!url) return url;
  try {
    const parsedUrl = new URL(url);

    ensurePoolerParam(parsedUrl.searchParams, "pgbouncer", "true");
    ensurePoolerParam(parsedUrl.searchParams, "connection_limit", "1");
    ensurePoolerParam(parsedUrl.searchParams, "pool_timeout", "30");

    return parsedUrl.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}pgbouncer=true&connection_limit=1&pool_timeout=30`;
  }
}

const datasourceUrl = withPgBouncerParams(process.env.DATABASE_URL);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : {}),
  });

globalForPrisma.prisma = db;