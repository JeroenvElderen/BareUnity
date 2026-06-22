import { NextResponse } from "next/server";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureUserMediaStorage } from "@/lib/storage-buckets";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";
import { ensureMemberCanAct } from "@/lib/action-access";
import { createPendingGalleryReviewDecision } from "@/lib/gallery-moderation";
import { enqueueDiscordGalleryReviewEvent } from "@/lib/discord-crosspost-sync";
import { Prisma } from "@prisma/client";
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
        typeMessage:
          "Unsupported file type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image.",
        sizeMessage: "Image uploads must be 8MB or smaller.",
        signatureMessage: "Image contents do not match the declared file type.",
      });
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const moderation = createPendingGalleryReviewDecision();

    const supabaseAdmin = createSupabaseAdminClient();
    const userMediaStorage = await ensureUserMediaStorage({
      supabaseAdmin,
      userId: viewerId,
    });
    const storagePath = `${userMediaStorage.postsFolder}/${Date.now()}-${crypto.randomUUID()}.${validatedUpload.extension}`;
    const { error } = await supabaseAdmin.storage
      .from(userMediaStorage.bucketId)
      .upload(storagePath, validatedUpload.buffer, {
        contentType: validatedUpload.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    const title =
      upload.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\-_]+/g, " ")
        .trim() || "Untitled capture";

    await db.$executeRaw(Prisma.sql`
      insert into public.gallery_media (
        image_path,
        owner_id,
        title,
        gallery_type,
        moderation_status,
        moderation_confidence,
        moderation_reason,
        contains_person,
        contains_adult_nudity,
        contains_landscape,
        contains_animal,
        contains_vehicle,
        contains_building,
        updated_at
      ) values (
        ${storagePath},
        ${viewerId}::uuid,
        ${title},
        ${moderation.galleryType},
        ${moderation.moderationStatus},
        ${moderation.confidence},
        ${moderation.reason},
        ${moderation.containsPerson},
        ${moderation.containsAdultNudity},
        ${moderation.containsLandscape},
        ${moderation.containsAnimal},
        ${moderation.containsVehicle},
        ${moderation.containsBuilding},
        now()
      )
      on conflict (image_path) do update set
        owner_id = excluded.owner_id,
        title = excluded.title,
        gallery_type = excluded.gallery_type,
        moderation_status = excluded.moderation_status,
        moderation_confidence = excluded.moderation_confidence,
        moderation_reason = excluded.moderation_reason,
        contains_person = excluded.contains_person,
        contains_adult_nudity = excluded.contains_adult_nudity,
        contains_landscape = excluded.contains_landscape,
        contains_animal = excluded.contains_animal,
        contains_vehicle = excluded.contains_vehicle,
        contains_building = excluded.contains_building,
        updated_at = now()
    `);

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

    await enqueueDiscordGalleryReviewEvent({
      imagePath: storagePath,
      ownerId: viewerId,
      title,
      source: "gallery_upload",
      bucketId: userMediaStorage.bucketId,
      signedUrl: signedUrlData?.signedUrl ?? null,
    });

    return NextResponse.json({
      ok: true,
      item: signedUrlData?.signedUrl
        ? {
            id: `media-${storagePath}`,
            title,
            place: "BareUnity Community",
            username: profile?.username ?? "unknown",
            path: storagePath,
            src: signedUrlData.signedUrl,
            galleryType: moderation.galleryType,
            moderationStatus: moderation.moderationStatus,
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
