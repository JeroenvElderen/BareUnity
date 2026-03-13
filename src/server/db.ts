import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function withPgBouncerParams(url?: string) {
  if (!url) return url;
  if (url.includes("pgbouncer=true")) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}pgbouncer=true&connection_limit=1`;
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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;