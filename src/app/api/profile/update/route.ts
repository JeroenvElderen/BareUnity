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
import { loadViewerFromRequest } from "@/lib/viewer";

const MAX_AVATAR_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BIO_LENGTH = 280;
const MAX_LOCATION_LENGTH = 80;
const MAX_INTERESTS = 8;
const MAX_INTEREST_LENGTH = 32;

type ProfileUpdateLogContext = {
  requestId: string;
  viewerId?: string | null;
};

function logProfileUpdate(
  level: "info" | "warn" | "error",
  message: string,
  context: ProfileUpdateLogContext & Record<string, unknown>,
) {
  const payload = {
    scope: "api.profile.update",
    ...context,
  };

  console[level](`[profile:update] ${message}`, payload);
}

function serializeProfileUpdateError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

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
  const requestId = crypto.randomUUID();
  let viewerId: string | null = null;

  logProfileUpdate("info", "request received", { requestId });

  try {
    const viewer = await loadViewerFromRequest(request);
    viewerId = viewer?.id ?? null;

    logProfileUpdate("info", "viewer loaded", {
      requestId,
      viewerId,
      hasViewer: Boolean(viewer),
      hasEmail: Boolean(viewer?.email),
    });

    if (!viewerId) {
      logProfileUpdate("warn", "request rejected because viewer is missing", { requestId });

      return NextResponse.json(
        { error: "Please sign in before updating your profile." },
        { status: 401 },
      );
    }

    const profileAccessError = await ensureCanUpdateOwnProfile(viewerId, viewer?.email);
    if (profileAccessError) {
      logProfileUpdate("warn", "profile access check failed", { requestId, viewerId });
      return profileAccessError;
    }

    logProfileUpdate("info", "profile access check passed", { requestId, viewerId });

    if (!isSupabaseAdminConfigured) {
      logProfileUpdate("error", "supabase admin client is not configured", { requestId, viewerId });

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

    logProfileUpdate("info", "form data parsed", {
      requestId,
      viewerId,
      displayNameLength: displayName?.length ?? 0,
      bioLength: bio?.length ?? 0,
      locationLength: location?.length ?? 0,
      interestCount: interests.length,
      hasAvatar: avatar instanceof File && avatar.size > 0,
      avatarSize: avatar instanceof File ? avatar.size : null,
      avatarType: avatar instanceof File ? avatar.type : null,
    });

    const supabaseAdmin = createSupabaseAdminClient();
    let avatarUrl: string | null | undefined;

    if (avatar instanceof File && avatar.size > 0) {
      logProfileUpdate("info", "avatar validation started", { requestId, viewerId });

      let validatedUpload;

      try {
        validatedUpload = await validateFileUpload(avatar, {
          allowedTypes: IMAGE_UPLOAD_TYPES,
          extensionByType: IMAGE_UPLOAD_EXTENSION_BY_TYPE,
          maxBytes: MAX_AVATAR_UPLOAD_BYTES,
          emptyMessage: "Please choose a non-empty profile image.",
          typeMessage: "Unsupported profile image type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image.",
          sizeMessage: "Profile images must be 3.5MB or smaller. Large images are resized in the profile editor before upload.",
          signatureMessage: "Profile image contents do not match the declared file type.",
        });
      } catch (error) {
        if (error instanceof UploadValidationError) {
          logProfileUpdate("warn", "avatar validation failed", {
            requestId,
            viewerId,
            status: error.status,
            error: serializeProfileUpdateError(error),
          });

          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }

      logProfileUpdate("info", "avatar validation passed", {
        requestId,
        viewerId,
        contentType: validatedUpload.contentType,
        extension: validatedUpload.extension,
        bytes: validatedUpload.buffer.byteLength,
      });

      const userMediaStorage = await ensureUserMediaStorage({ supabaseAdmin, userId: viewerId });
      logProfileUpdate("info", "user media storage resolved", {
        requestId,
        viewerId,
        bucketId: userMediaStorage.bucketId,
        avatarFolder: userMediaStorage.avatarFolder,
      });
      const storagePath = `${userMediaStorage.avatarFolder}/${Date.now()}-${crypto.randomUUID()}.${validatedUpload.extension}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(userMediaStorage.bucketId)
        .upload(storagePath, validatedUpload.buffer, {
          contentType: validatedUpload.contentType,
          upsert: false,
        });

      if (uploadError) {
        logProfileUpdate("error", "avatar upload failed", {
          requestId,
          viewerId,
          bucketId: userMediaStorage.bucketId,
          storagePath,
          error: uploadError,
        });

        throw new Error(uploadError.message);
      }

      avatarUrl = storagePath;
      logProfileUpdate("info", "avatar uploaded", {
        requestId,
        viewerId,
        bucketId: userMediaStorage.bucketId,
        storagePath,
      });
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

    logProfileUpdate("info", "updating profile row", {
      requestId,
      viewerId,
      fields: Object.keys(profilePatch),
      includesAvatar: Boolean(profilePatch.avatar_url),
    });

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profilePatch)
      .eq("id", viewerId);

    if (profileError) {
      logProfileUpdate("error", "profile row update failed", {
        requestId,
        viewerId,
        error: profileError,
      });

      throw new Error(profileError.message);
    }

    logProfileUpdate("info", "profile row updated", { requestId, viewerId });

    logProfileUpdate("info", "upserting profile settings row", {
      requestId,
      viewerId,
      interestCount: interests.length,
    });

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
      logProfileUpdate("error", "profile settings upsert failed", {
        requestId,
        viewerId,
        error: settingsError,
      });

      throw new Error(settingsError.message);
    }

    logProfileUpdate("info", "profile settings row upserted", { requestId, viewerId });
    logProfileUpdate("info", "request completed", { requestId, viewerId });

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
    logProfileUpdate("error", "request failed", {
      requestId,
      viewerId,
      error: serializeProfileUpdateError(error),
    });

    return NextResponse.json(
      { error: "Profile updates are unavailable right now." },
      { status: 503 },
    );
  }
}
