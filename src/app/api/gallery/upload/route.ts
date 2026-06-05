import { NextResponse } from "next/server";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureUserMediaStorage } from "@/lib/storage-buckets";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";
import { ensureMemberCanAct } from "@/lib/action-access";
import {
  IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  IMAGE_UPLOAD_TYPES,
  UploadValidationError,
  validateFileUpload,
} from "@/lib/upload-security";

const MAX_GALLERY_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json(
        { error: "Please sign in before uploading." },
        { status: 401 },
      );
    }

    const actionAccessError = await ensureMemberCanAct(viewerId);
    if (actionAccessError) return actionAccessError;

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json(
        { error: "Image upload unavailable. Supabase is not configured." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const upload = formData.get("image");
    if (!(upload instanceof File)) {
      return NextResponse.json(
        { error: "Please choose an image file to upload." },
        { status: 400 },
      );
    }

    let validatedUpload;

    try {
      validatedUpload = await validateFileUpload(upload, {
        allowedTypes: IMAGE_UPLOAD_TYPES,
        extensionByType: IMAGE_UPLOAD_EXTENSION_BY_TYPE,
        maxBytes: MAX_GALLERY_UPLOAD_BYTES,
        emptyMessage: "Please choose a non-empty image file to upload.",
        typeMessage: "Unsupported file type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image.",
        sizeMessage: "Image uploads must be 8MB or smaller.",
        signatureMessage: "Image contents do not match the declared file type.",
      });
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const userMediaStorage = await ensureUserMediaStorage({ supabaseAdmin, userId: viewerId });
    const storagePath = `${userMediaStorage.galleryFolder}/${Date.now()}-${crypto.randomUUID()}.${validatedUpload.extension}`;
    const { error } = await supabaseAdmin.storage
      .from(userMediaStorage.bucketId)
      .upload(storagePath, validatedUpload.buffer, {
        contentType: validatedUpload.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    const [{ data: signedUrlData }, profile] = await Promise.all([
      supabaseAdmin.storage
        .from(userMediaStorage.bucketId)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7, {
          transform: {
            quality: 78,
          },
        }),
      db.profiles.findUnique({
        where: { id: viewerId },
        select: { username: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      item: signedUrlData?.signedUrl
        ? {
            id: `media-${storagePath}`,
            title:
              upload.name.replace(/\.[^.]+$/, "").replace(/[\-_]+/g, " ").trim() ||
              "Untitled capture",
            place: "BareUnity Community",
            username: profile?.username ?? "unknown",
            path: storagePath,
            src: signedUrlData.signedUrl,
            likeCount: 0,
            likedByViewer: false,
          }
        : null,
    });
  } catch (error) {
    console.error("Unable to upload gallery image", error);
    return NextResponse.json(
      { error: "Gallery upload is unavailable right now." },
      { status: 503 },
    );
  }
}
