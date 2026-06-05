import { NextResponse } from "next/server";

import { ensureCanUpdateOwnProfile } from "@/lib/action-access";
import {
  IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  IMAGE_UPLOAD_TYPES,
  UploadValidationError,
  validateFileUpload,
} from "@/lib/upload-security";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureUserMediaStorage } from "@/lib/storage-buckets";
import { loadViewerIdFromRequest } from "@/lib/viewer";

const MAX_AVATAR_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BIO_LENGTH = 280;
const MAX_LOCATION_LENGTH = 80;
const MAX_INTERESTS = 8;
const MAX_INTEREST_LENGTH = 32;

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned.slice(0, maxLength);
}

function cleanInterests(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((entry) => entry.slice(0, MAX_INTEREST_LENGTH)),
    ),
  ).slice(0, MAX_INTERESTS);
}

export async function PATCH(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json(
        { error: "Please sign in before updating your profile." },
        { status: 401 },
      );
    }

    const profileAccessError = await ensureCanUpdateOwnProfile(viewerId);
    if (profileAccessError) return profileAccessError;

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json(
        { error: "Profile updates are unavailable. Supabase is not configured." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const displayName = cleanText(formData.get("displayName"), MAX_DISPLAY_NAME_LENGTH);
    const bio = cleanText(formData.get("bio"), MAX_BIO_LENGTH);
    const location = cleanText(formData.get("location"), MAX_LOCATION_LENGTH);
    const interests = cleanInterests(formData.get("interests"));
    const avatar = formData.get("avatar");
    const supabaseAdmin = createSupabaseAdminClient();
    let avatarUrl: string | null | undefined;

    if (avatar instanceof File && avatar.size > 0) {
      let validatedUpload;

      try {
        validatedUpload = await validateFileUpload(avatar, {
          allowedTypes: IMAGE_UPLOAD_TYPES,
          extensionByType: IMAGE_UPLOAD_EXTENSION_BY_TYPE,
          maxBytes: MAX_AVATAR_UPLOAD_BYTES,
          emptyMessage: "Please choose a non-empty profile image.",
          typeMessage: "Unsupported profile image type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image.",
          sizeMessage: "Profile images must be 8MB or smaller. Large images are resized in the profile editor before upload.",
          signatureMessage: "Profile image contents do not match the declared file type.",
        });
      } catch (error) {
        if (error instanceof UploadValidationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

      const userMediaStorage = await ensureUserMediaStorage({ supabaseAdmin, userId: viewerId });
      const storagePath = `${userMediaStorage.avatarFolder}/${Date.now()}-${crypto.randomUUID()}.${validatedUpload.extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(userMediaStorage.bucketId)
        .upload(storagePath, validatedUpload.buffer, {
          contentType: validatedUpload.contentType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      avatarUrl = storagePath;
    }

    const profilePatch: {
      display_name: string | null;
      bio: string | null;
      location: string | null;
      avatar_url?: string;
    } = {
      display_name: displayName,
      bio,
      location,
    };

    if (avatarUrl) {
      profilePatch.avatar_url = avatarUrl;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profilePatch)
      .eq("id", viewerId);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .upsert(
        {
          user_id: viewerId,
          interests,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    return NextResponse.json({
      ok: true,
      profile: {
        display_name: displayName,
        bio,
        location,
        avatar_url: avatarUrl,
      },
      interests,
    });
  } catch (error) {
    console.error("Unable to update profile", error);
    return NextResponse.json(
      { error: "Profile updates are unavailable right now." },
      { status: 503 },
    );
  }
}
