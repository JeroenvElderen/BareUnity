import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { buildSettingsSnapshotPayload, EMPTY_SETTINGS_SNAPSHOT, getSettingsSnapshotSourceVersion, type SettingsSnapshotPayload } from "@/lib/settings-snapshot";
import { readServerCache, writeServerCache } from "@/lib/server-user-cache";
import { loadViewerIdFromRequest } from "@/lib/viewer";

const CACHE_SCOPE = "settings";
const CACHE_KEY = "profile-security:v1";

async function fetchSettingsViaRpc(userId: string): Promise<SettingsSnapshotPayload | null> {
  if (!isSupabaseAdminConfigured) return null;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.rpc("rpc_get_settings_snapshot", {
      p_user_id: userId,
    });

    if (error || !data || typeof data !== "object") return null;
    return data as SettingsSnapshotPayload;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) return NextResponse.json(EMPTY_SETTINGS_SNAPSHOT);

    const sourceVersion = await getSettingsSnapshotSourceVersion(viewerId);
    const cached = await readServerCache<SettingsSnapshotPayload>({
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

    const payload = (await fetchSettingsViaRpc(viewerId)) ?? (await buildSettingsSnapshotPayload(viewerId));

    await writeServerCache({
      userId: viewerId,
      scope: CACHE_SCOPE,
      key: CACHE_KEY,
      value: payload,
      sourceVersion,
      ttlSeconds: 60 * 30,
    });

    return NextResponse.json(payload, {
      headers: {
        "x-bareunity-cache": "miss",
        "x-bareunity-cache-version": sourceVersion,
      },
    });
  } catch (error) {
    console.error("Unable to load settings snapshot", error);
    return NextResponse.json(EMPTY_SETTINGS_SNAPSHOT, { status: 503 });
  }
}
