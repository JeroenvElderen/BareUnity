import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { buildGallerySnapshotPayload, type GallerySnapshotItem } from "@/lib/gallery-snapshot";

async function fetchGalleryViaRpc(): Promise<GallerySnapshotItem[] | null> {
  if (!isSupabaseAdminConfigured) return null;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.rpc("rpc_get_gallery_snapshot");
    if (error || !Array.isArray(data)) return null;

    return data as GallerySnapshotItem[];
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const payload = (await fetchGalleryViaRpc()) ?? (await buildGallerySnapshotPayload());
    return NextResponse.json({ items: payload });
  } catch (error) {
    console.error("Unable to load gallery snapshot", error);
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
