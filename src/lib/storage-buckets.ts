import type { SupabaseClient } from "@supabase/supabase-js";

const MEDIA_BUCKET_ID = "media";
const MEDIA_BUCKET_FILE_SIZE_LIMIT = 15 * 1024 * 1024;
const MEDIA_BUCKET_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

let mediaBucketReady: Promise<void> | null = null;

function isAlreadyExistsError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("duplicate") ||
    normalizedMessage.includes("resource already exists")
  );
}

export async function ensureMediaBucket(supabaseAdmin: SupabaseClient) {
  if (!mediaBucketReady) {
    mediaBucketReady = (async () => {
      const bucketOptions = {
        public: true,
        fileSizeLimit: MEDIA_BUCKET_FILE_SIZE_LIMIT,
        allowedMimeTypes: MEDIA_BUCKET_MIME_TYPES,
      };

      const { error: getBucketError } = await supabaseAdmin.storage.getBucket(MEDIA_BUCKET_ID);
      if (!getBucketError) {
        const { error: updateBucketError } = await supabaseAdmin.storage.updateBucket(
          MEDIA_BUCKET_ID,
          bucketOptions,
        );

        if (updateBucketError) {
          throw new Error(
            `Could not update Supabase Storage bucket '${MEDIA_BUCKET_ID}': ${updateBucketError.message}`,
          );
        }

        return;
      }

      const { error: createBucketError } = await supabaseAdmin.storage.createBucket(
        MEDIA_BUCKET_ID,
        bucketOptions,
      );

      if (createBucketError && !isAlreadyExistsError(createBucketError.message)) {
        throw new Error(
          `Could not prepare Supabase Storage bucket '${MEDIA_BUCKET_ID}': ${createBucketError.message}`,
        );
      }
    })().catch((error) => {
      mediaBucketReady = null;
      throw error;
    });
  }

  return mediaBucketReady;
}

export async function ensureUserMediaStorage(args: {
  supabaseAdmin: SupabaseClient;
  userId: string;
}) {
  await ensureMediaBucket(args.supabaseAdmin);

  return {
    bucketId: MEDIA_BUCKET_ID,
    avatarFolder: `avatars/${args.userId}`,
    galleryFolder: `gallery/${args.userId}`,
    postsFolder: `posts/${args.userId}`,
    storiesFolder: `stories/${args.userId}`,
  };
}
