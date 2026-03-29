import { NextResponse } from "next/server";

import { buildHomeFeedPayload, getHomeFeedSourceVersion } from "@/lib/homefeed-server";
import { buildProfileSnapshotPayload, getProfileSnapshotSourceVersion } from "@/lib/profile-snapshot";
import { writeServerCache } from "@/lib/server-user-cache";
import { buildSettingsSnapshotPayload, getSettingsSnapshotSourceVersion } from "@/lib/settings-snapshot";
import { db } from "@/server/db";

const MAX_USERS_TO_WARM = 100;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CACHE_WARM_SECRET;
  if (!configuredSecret) return false;

  const headerSecret = request.headers.get("x-cache-warm-secret")?.trim();
  return Boolean(headerSecret && headerSecret === configuredSecret);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.users.findMany({
    where: {
      last_sign_in_at: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
      },
    },
    select: { id: true },
    orderBy: { last_sign_in_at: "desc" },
    take: MAX_USERS_TO_WARM,
  });

  let warmedCount = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const user of users) {
    try {
      const [sourceVersion, payload] = await Promise.all([
        getHomeFeedSourceVersion(user.id),
        buildHomeFeedPayload(user.id),
      ]);

      await writeServerCache({
        userId: user.id,
        scope: "homefeed",
        key: "homefeed:v1",
        sourceVersion,
        value: payload,
        ttlSeconds: 60 * 60,
      });

      const [profileSourceVersion, profilePayload] = await Promise.all([
        getProfileSnapshotSourceVersion(user.id),
        buildProfileSnapshotPayload(user.id),
      ]);

      await writeServerCache({
        userId: user.id,
        scope: "profile",
        key: "snapshot:v1",
        sourceVersion: profileSourceVersion,
        value: profilePayload,
        ttlSeconds: 60 * 30,
      });

      const [settingsSourceVersion, settingsPayload] = await Promise.all([
        getSettingsSnapshotSourceVersion(user.id),
        buildSettingsSnapshotPayload(user.id),
      ]);

      await writeServerCache({
        userId: user.id,
        scope: "settings",
        key: "profile-security:v1",
        sourceVersion: settingsSourceVersion,
        value: settingsPayload,
        ttlSeconds: 60 * 30,
      });

      warmedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown warmup failure";
      errors.push({ userId: user.id, message });
    }
  }

  return NextResponse.json({
    totalCandidates: users.length,
    warmedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
  });
}