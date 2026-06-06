import { NextResponse } from "next/server";

import { ensureCanUpdateOwnProfile } from "@/lib/action-access";
import {
  IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  IMAGE_UPLOAD_TYPES,
} from "@/lib/upload-security";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureUserMediaStorage } from "@/lib/storage-buckets";
import { loadViewerFromRequest } from "@/lib/viewer";

const MAX_AVATAR_UPLOAD_BYTES = 15 * 1024 * 1024;

type AvatarUploadRequestBody = {
  fileName?: unknown;
  contentType?: unknown;
  size?: unknown;
};

function cleanFileBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "profile-avatar";
}

export async function POST(request: Request) {
  const viewer = await loadViewerFromRequest(request);
  const viewerId = viewer?.id ?? null;

  if (!viewerId) {
    return NextResponse.json(
      { error: "Please sign in before updating your profile." },
      { status: 401 },
    );
  }

  const profileAccessError = await ensureCanUpdateOwnProfile(viewerId, viewer?.email);
  if (profileAccessError) return profileAccessError;

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Profile image uploads are unavailable. Supabase is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as AvatarUploadRequestBody | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "profile-avatar";
  const size = typeof body?.size === "number" ? body.size : 0;

  if (!IMAGE_UPLOAD_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Unsupported profile image type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image." },
      { status: 400 },
    );
  }

  if (!size || size > MAX_AVATAR_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Profile images must be 15MB or smaller." },
      { status: size > MAX_AVATAR_UPLOAD_BYTES ? 413 : 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const userMediaStorage = await ensureUserMediaStorage({ supabaseAdmin, userId: viewerId });
  const extension = IMAGE_UPLOAD_EXTENSION_BY_TYPE[contentType] ?? "bin";
  const storagePath = `${userMediaStorage.avatarFolder}/${Date.now()}-${crypto.randomUUID()}-${cleanFileBaseName(fileName)}.${extension}`;

  const { data, error } = await supabaseAdmin.storage
    .from(userMediaStorage.bucketId)
    .createSignedUploadUrl(storagePath, {
      upsert: false,
    });

  if (error) {
    return NextResponse.json(
      { error: `Could not prepare profile image upload: ${error.message}` },
      { status: 503 },
    );
  }

  return NextResponse.json({
    bucketId: userMediaStorage.bucketId,
    path: storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
