import { NextResponse } from "next/server";

import {
  buildSettingsSnapshotPayload,
  EMPTY_SETTINGS_SNAPSHOT,
  getSettingsSnapshotSourceVersion,
  type SettingsSnapshotPayload,
} from "@/lib/settings-snapshot";
import { normalizeSettingOptionStates } from "@/lib/settings-controls";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { readServerCache, writeServerCache } from "@/lib/server-user-cache";
import { loadViewerIdFromRequest } from "@/lib/viewer";

const CACHE_SCOPE = "settings";
const CACHE_KEY = "profile-security:v2";

async function fetchSettingsViaRpc(
  userId: string,
): Promise<SettingsSnapshotPayload | null> {
  if (!isSupabaseAdminConfigured) return null;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.rpc("rpc_get_settings_snapshot", {
      p_user_id: userId,
    });

    if (error || !data || typeof data !== "object") return null;
    
    const rawPayload = data as Partial<SettingsSnapshotPayload> & {
      recoveryKeys?: unknown;
    };

    return {
      username: rawPayload.username ?? EMPTY_SETTINGS_SNAPSHOT.username,
      email: rawPayload.email ?? EMPTY_SETTINGS_SNAPSHOT.email,
      hasRecoveryKeys:
        rawPayload.hasRecoveryKeys ??
        (Array.isArray(rawPayload.recoveryKeys) &&
          rawPayload.recoveryKeys.length > 0),
      addPostImagesToGallery:
        rawPayload.addPostImagesToGallery ??
        EMPTY_SETTINGS_SNAPSHOT.addPostImagesToGallery,
      optionStates: normalizeSettingOptionStates(rawPayload.optionStates),
    };
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

    const payload =
      (await fetchSettingsViaRpc(viewerId)) ??
      (await buildSettingsSnapshotPayload(viewerId));

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
