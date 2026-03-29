import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { buildProfileSnapshotPayload, EMPTY_PROFILE_SNAPSHOT, getProfileSnapshotSourceVersion, type ProfileSnapshotPayload } from "@/lib/profile-snapshot";
import { readServerCache, writeServerCache } from "@/lib/server-user-cache";
import { loadViewerIdFromRequest } from "@/lib/viewer";

const CACHE_SCOPE = "profile";
const CACHE_KEY = "snapshot:v1";

async function fetchSnapshotViaRpc(userId: string): Promise<ProfileSnapshotPayload | null> {
  if (!isSupabaseAdminConfigured) return null;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.rpc("rpc_get_profile_snapshot", {
      p_user_id: userId,
    });

    if (error) {
      console.warn("rpc_get_profile_snapshot failed; falling back to Prisma snapshot", error);
      return null;
    }

    if (!data || typeof data !== "object") {
      return null;
    }

    return data as ProfileSnapshotPayload;
  } catch (error) {
    console.warn("rpc_get_profile_snapshot unavailable; falling back to Prisma snapshot", error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json(EMPTY_PROFILE_SNAPSHOT);
    }

    const sourceVersion = await getProfileSnapshotSourceVersion(viewerId);
    const cached = await readServerCache<ProfileSnapshotPayload>({
      userId: viewerId,
      scope: CACHE_SCOPE,
      key: CACHE_KEY,
    });

    if (cached && cached.sourceVersion === sourceVersion) {
      return NextResponse.json(cached.value, {
        headers: {
          "x-bareunity-cache": "hit",
          "x-bareunity-cache-version": sourceVersion,
        },
      });
    }

    const payload = (await fetchSnapshotViaRpc(viewerId)) ?? (await buildProfileSnapshotPayload(viewerId));

    await writeServerCache({
      userId: viewerId,
      scope: CACHE_SCOPE,
      key: CACHE_KEY,
      value: payload,
      sourceVersion,
      ttlSeconds: 60 * 10,
    });

    return NextResponse.json(payload, {
      headers: {
        "x-bareunity-cache": "miss",
        "x-bareunity-cache-version": sourceVersion,
      },
    });
  } catch (error) {
    console.error("Unable to load profile snapshot", error);
    return NextResponse.json(EMPTY_PROFILE_SNAPSHOT, { status: 503 });
  }
}
