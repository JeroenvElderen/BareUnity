import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const STAY_IMAGE_BUCKET_PREFIX = "stay-images";
const STAY_IMAGE_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
const STAY_IMAGE_FETCH_TIMEOUT_MS = 12_000;
const STAY_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const IMAGE_EXTENSION_BY_MIME_TYPE = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const bucketReadyPromises = new Map<string, Promise<void>>();

export type MirroredStayGallery = {
  gallery: string[];
  warnings: string[];
};

function isAlreadyExistsError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("duplicate") ||
    normalizedMessage.includes("resource already exists")
  );
}

function slugifyStoragePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function websiteHostname(websiteUrl: string) {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "imported-website";
  }
}

function bucketIdForWebsite(websiteUrl: string) {
  const hostSlug = slugifyStoragePart(websiteHostname(websiteUrl));
  return `${STAY_IMAGE_BUCKET_PREFIX}-${hostSlug || "imported-website"}`.slice(
    0,
    63,
  );
}

function objectFolderForStay(slug?: string) {
  return slugifyStoragePart(slug || "draft") || "draft";
}

function isPublicSupabaseStorageUrl(value: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return false;

  try {
    const url = new URL(value);
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return (
      url.origin === supabaseUrl.origin &&
      url.pathname.includes("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

function contentTypeFromResponse(response: Response, imageUrl: URL) {
  const headerContentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (headerContentType && STAY_IMAGE_MIME_TYPES.includes(headerContentType)) {
    return headerContentType;
  }

  const extension = imageUrl.pathname.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";

  return "";
}

function assertSafeImageUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http(s) image URLs can be imported.");
  }

  return url;
}

function imageHash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

async function ensureStayImageBucket(
  supabaseAdmin: SupabaseClient,
  bucketId: string,
) {
  if (!bucketReadyPromises.has(bucketId)) {
    bucketReadyPromises.set(
      bucketId,
      (async () => {
        const bucketOptions = {
          public: true,
          fileSizeLimit: STAY_IMAGE_FILE_SIZE_LIMIT,
          allowedMimeTypes: STAY_IMAGE_MIME_TYPES,
        };

        const { error: getBucketError } =
          await supabaseAdmin.storage.getBucket(bucketId);

        if (!getBucketError) {
          const { error: updateBucketError } =
            await supabaseAdmin.storage.updateBucket(bucketId, bucketOptions);

          if (updateBucketError) {
            throw new Error(
              `Could not update Supabase Storage bucket '${bucketId}': ${updateBucketError.message}`,
            );
          }

          return;
        }

        const { error: createBucketError } =
          await supabaseAdmin.storage.createBucket(bucketId, bucketOptions);

        if (
          createBucketError &&
          !isAlreadyExistsError(createBucketError.message)
        ) {
          throw new Error(
            `Could not prepare Supabase Storage bucket '${bucketId}': ${createBucketError.message}`,
          );
        }
      })().catch((error) => {
        bucketReadyPromises.delete(bucketId);
        throw error;
      }),
    );
  }

  return bucketReadyPromises.get(bucketId)!;
}

async function fetchImage(imageUrl: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    STAY_IMAGE_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "BareUnity stay image importer (+https://bareunity.com)",
        Accept: STAY_IMAGE_MIME_TYPES.join(","),
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Image returned ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > STAY_IMAGE_FILE_SIZE_LIMIT
    ) {
      throw new Error("Image is larger than the stay image upload limit.");
    }

    const contentType = contentTypeFromResponse(response, imageUrl);
    if (!contentType) {
      throw new Error("Image response did not use a supported image type.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Image response was empty.");
    if (buffer.byteLength > STAY_IMAGE_FILE_SIZE_LIMIT) {
      throw new Error("Image is larger than the stay image upload limit.");
    }

    return { buffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function mirrorStayImage(args: {
  supabaseAdmin: SupabaseClient;
  bucketId: string;
  imageUrl: string;
  staySlug?: string;
  index: number;
}) {
  const imageUrl = assertSafeImageUrl(args.imageUrl);
  const { buffer, contentType } = await fetchImage(imageUrl);
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE.get(contentType) ?? "jpg";
  const objectPath = [
    objectFolderForStay(args.staySlug),
    `${String(args.index + 1).padStart(2, "0")}-${imageHash(buffer)}.${extension}`,
  ].join("/");

  const { error: uploadError } = await args.supabaseAdmin.storage
    .from(args.bucketId)
    .upload(objectPath, buffer, {
      cacheControl: "31536000",
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not upload image to Supabase: ${uploadError.message}`);
  }

  const { data } = args.supabaseAdmin.storage
    .from(args.bucketId)
    .getPublicUrl(objectPath);

  return data.publicUrl;
}

export async function mirrorStayGalleryToSupabase(args: {
  gallery: string[];
  websiteUrl: string;
  staySlug?: string;
}): Promise<MirroredStayGallery> {
  const gallery = [...new Set(args.gallery.map((item) => item.trim()).filter(Boolean))];
  const externalImages = gallery.filter(
    (imageUrl) => !isPublicSupabaseStorageUrl(imageUrl),
  );

  if (!externalImages.length) return { gallery, warnings: [] };

  if (!isSupabaseAdminConfigured) {
    return {
      gallery,
      warnings: [
        "Stay gallery images were left as source website URLs because Supabase admin storage is not configured.",
      ],
    };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const bucketId = bucketIdForWebsite(args.websiteUrl);
  const warnings: string[] = [];

  await ensureStayImageBucket(supabaseAdmin, bucketId);

  const mirroredUrls = await Promise.all(
    gallery.map(async (imageUrl, index) => {
      if (isPublicSupabaseStorageUrl(imageUrl)) return imageUrl;

      try {
        return await mirrorStayImage({
          supabaseAdmin,
          bucketId,
          imageUrl,
          staySlug: args.staySlug,
          index,
        });
      } catch (error) {
        warnings.push(
          `Could not copy gallery image ${index + 1} to Supabase (${error instanceof Error ? error.message : "unknown error"}). Kept the source URL for review.`,
        );
        return imageUrl;
      }
    }),
  );

  return {
    gallery: mirroredUrls,
    warnings: [
      `Copied stay gallery images into Supabase Storage bucket '${bucketId}'.`,
      ...warnings,
    ],
  };
}
