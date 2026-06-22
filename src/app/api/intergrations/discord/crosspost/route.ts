import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { classifyPostsBucketImageForGallery } from "@/lib/post-gallery-classification";
import { ensureUserMediaStorage } from "@/lib/storage-buckets";
import { validateImageBuffer } from "@/lib/upload-security";
import {
  CROSSPOST_OWNER_DISCORD_USER_ID,
  CROSSPOST_OWNER_PROFILE_ID,
  findBareUnityProfileByDiscordUserId,
  getFallbackAuthorId,
  normalizeDiscordId,
  normalizeOptionalString,
  requireIntegrationRequest,
} from "./helpers";

type Attachment = {
  url?: unknown;
  contentType?: unknown;
  filename?: unknown;
};

type CreatedPostRow = {
  id: string;
  author_id: string | null;
  channel_id: string | null;
  title: string | null;
  content: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  post_type: string | null;
  created_at: string | null;
};

const DEFAULT_CROSSPOST_FORUM_IDS = [
  "1515845739870425208",
  "1516001611925684265",
  "1517154128541909152",
];

function parseCrosspostForumIds(value: string | undefined) {
  return new Set(
    (value ? value.split(",") : DEFAULT_CROSSPOST_FORUM_IDS)
      .map((channelId) => channelId.trim())
      .filter(Boolean),
  );
}

const CROSSPOST_FORUM_IDS = parseCrosspostForumIds(
  process.env.DISCORD_CROSSPOST_FORUM_IDS ?? process.env.DISCORD_CROSSPOST_FORUM_ID,
);
const MAX_DISCORD_IMAGE_BYTES = 15 * 1024 * 1024;

function looksLikeImageAttachment(attachment: Attachment) {
  if (typeof attachment.url !== "string") return false;
  if (
    typeof attachment.contentType === "string" &&
    attachment.contentType.toLowerCase().startsWith("image/")
  ) {
    return true;
  }

  return (
    typeof attachment.filename === "string" &&
    /\.(?:jpe?g|png|webp|gif|avif)$/i.test(attachment.filename)
  );
}

function cleanFileBaseName(value: string) {
  return (
    value
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "discord-post-image"
  );
}

async function persistDiscordImage(args: {
  supabaseAdmin: SupabaseClient;
  authorId: string;
  discordThreadId: string;
  attachment: Attachment | undefined;
}) {
  const attachmentUrl =
    typeof args.attachment?.url === "string" ? args.attachment.url : null;
  if (!attachmentUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(attachmentUrl);
  } catch {
    throw new Error("Discord attachment URL is invalid.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Discord attachment URL must be HTTP or HTTPS.");
  }

  const response = await fetch(parsedUrl, {
    headers: {
      "user-agent": "BareUnity Discord crosspost image fetcher",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not download Discord image (${response.status} ${response.statusText}).`,
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DISCORD_IMAGE_BYTES) {
    throw new Error("Discord image is larger than the 15MB post limit.");
  }

  const declaredContentType =
    typeof args.attachment?.contentType === "string"
      ? args.attachment.contentType.toLowerCase()
      : "";
  const responseContentType =
    response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
  const contentType = declaredContentType || responseContentType;
  const buffer = Buffer.from(await response.arrayBuffer());
  const validatedImage = validateImageBuffer({
    buffer,
    contentType,
    maxBytes: MAX_DISCORD_IMAGE_BYTES,
  });

  const userMediaStorage = await ensureUserMediaStorage({
    supabaseAdmin: args.supabaseAdmin,
    userId: args.authorId,
  });

  const rawFileName =
    typeof args.attachment?.filename === "string"
      ? args.attachment.filename
      : "discord-post-image";
  const storagePath = `${userMediaStorage.postsFolder}/${Date.now()}-${crypto.randomUUID()}-${cleanFileBaseName(rawFileName)}.${validatedImage.extension}`;

  const { error: uploadError } = await args.supabaseAdmin.storage
    .from(userMediaStorage.bucketId)
    .upload(storagePath, buffer, {
      contentType: validatedImage.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Could not save Discord image to Supabase Storage bucket '${userMediaStorage.bucketId}': ${uploadError.message}`,
    );
  }

  const { data } = args.supabaseAdmin.storage
    .from(userMediaStorage.bucketId)
    .getPublicUrl(storagePath);

  return {
    bucketId: userMediaStorage.bucketId,
    path: storagePath,
    publicUrl: data.publicUrl,
  };
}

function buildWebsitePostUrl(postId: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://bareunity.com";
  return `${siteUrl.replace(/\/$/, "")}/?postId=${postId}`;
}

export async function POST(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const discordChannelId = normalizeDiscordId(body.discordChannelId);
  const discordThreadId = normalizeDiscordId(body.discordThreadId);
  const discordAuthorId = normalizeDiscordId(body.discordAuthorId);
  const discordAuthorDisplayName =
    normalizeOptionalString(body.discordAuthorDisplayName, 120) ??
    "BareUnity Discord member";
  const discordThreadUrl = normalizeOptionalString(body.discordThreadUrl, 500);
  const title =
    normalizeOptionalString(body.title, 180) ?? "BareUnity Discord post";
  const targetCategory = normalizeOptionalString(body.targetCategory, 80);
  if (targetCategory === "skip" || targetCategory === "none") {
    return NextResponse.json({ ok: true, skipped: true, reason: "Moderator selected no website upload." });
  }
  const rawContent = normalizeOptionalString(body.content, 12000) ?? "";
  const attachments = Array.isArray(body.attachments)
    ? (body.attachments as Attachment[])
    : [];
  const imageAttachments = attachments.filter(looksLikeImageAttachment);
  const firstImage = imageAttachments[0];
  if (!discordChannelId || !CROSSPOST_FORUM_IDS.has(discordChannelId)) {
    return NextResponse.json(
      { error: "This Discord channel is not configured for cross-posting." },
      { status: 400 },
    );
  }

  if (!discordThreadId || !discordAuthorId) {
    return NextResponse.json(
      { error: "Discord thread and author IDs are required." },
      { status: 400 },
    );
  }

  if (!rawContent && !firstImage) {
    return NextResponse.json(
      { error: "A Discord post needs content or an image to cross-post." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: existingSync, error: existingSyncError } = await supabaseAdmin
    .from("discord_reddit_crosspost_sync")
    .select("website_post_id, website_post_url, reddit_url, status")
    .eq("discord_thread_id", discordThreadId)
    .maybeSingle();

  if (existingSyncError) {
    return NextResponse.json(
      { error: existingSyncError.message },
      { status: 500 },
    );
  }

  if (existingSync?.website_post_id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      websitePostId: existingSync.website_post_id,
      websitePostUrl: existingSync.website_post_url,
      redditUrl: existingSync.reddit_url,
      status: existingSync.status,
    });
  }

  const isOwnerPost = discordAuthorId === CROSSPOST_OWNER_DISCORD_USER_ID;

  const linkedProfile = isOwnerPost
    ? null
    : await findBareUnityProfileByDiscordUserId(supabaseAdmin, discordAuthorId);

  const authorId = isOwnerPost
    ? CROSSPOST_OWNER_PROFILE_ID
    : (linkedProfile?.id ?? (await getFallbackAuthorId(supabaseAdmin)));
  const authorMode = isOwnerPost
    ? "owner_profile"
    : linkedProfile?.id
      ? "linked_user"
      : "fallback_with_disclaimer";
  const content =
    authorMode === "linked_user" || authorMode === "owner_profile"
      ? rawContent
      : [
          "Note: This post was shared by a member of the BareUnity Discord community.",
          `Original Discord author: ${discordAuthorDisplayName}`,
          discordThreadUrl
            ? `Original Discord thread: ${discordThreadUrl}`
            : null,
          "",
          rawContent,
        ]
          .filter((line) => line !== null)
          .join("\n");

  const persistedImages: Array<NonNullable<Awaited<ReturnType<typeof persistDiscordImage>>>> = [];
  try {
    for (const attachment of imageAttachments) {
      const persistedImage = await persistDiscordImage({
        supabaseAdmin,
        authorId,
        discordThreadId,
        attachment,
      });
      if (persistedImage) persistedImages.push(persistedImage);
    }
  } catch (error) {
    console.error("Discord crosspost could not save image to posts bucket", {
      error,
      discordThreadId,
      discordAuthorId,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save Discord image to posts bucket.",
      },
      { status: 500 },
    );
  }

  const mediaUrls = persistedImages.map((image) => image.publicUrl);
  const mediaUrl = mediaUrls[0] ?? null;

  const postInsertPayload = {
    author_id: authorId,
    channel_id: null,
    title,
    content,
    media_url: mediaUrl,
    media_urls: mediaUrls,
    post_type: mediaUrls.length ? "image" : "text",
  };

  const { data: createdPost, error: postError } = await supabaseAdmin
    .from("posts")
    .insert(postInsertPayload)
    .select(
      "id, author_id, channel_id, title, content, media_url, media_urls, post_type, created_at",
    )
    .single<CreatedPostRow>();

  if (postError || !createdPost?.id) {
    console.error("Discord crosspost could not insert public.posts row", {
      error: postError,
      discordThreadId,
      discordAuthorId,
      postInsertPayload,
    });
    return NextResponse.json(
      { error: postError?.message ?? "Could not create public.posts row." },
      { status: 500 },
    );
  }

  const websitePostId = String(createdPost.id);
  const websitePostUrl = buildWebsitePostUrl(websitePostId);

  for (const image of persistedImages) {
    await classifyPostsBucketImageForGallery({
      imagePath: image.path,
      ownerId: authorId,
      title,
      source: "discord_crosspost",
      websitePostId,
      discordThreadId,
      publicUrl: image.publicUrl,
      bucketId: image.bucketId,
    });
  }

  const { error: syncError } = await supabaseAdmin
    .from("discord_reddit_crosspost_sync")
    .upsert(
      {
        discord_thread_id: discordThreadId,
        discord_channel_id: discordChannelId,
        discord_user_id: discordAuthorId,
        website_post_id: websitePostId,
        website_post_url: websitePostUrl,
        author_mode: authorMode,
        status: "website_posted",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "discord_thread_id" },
    );

  if (syncError) {
    console.error("Could not record Discord crosspost sync", syncError);
  }

  return NextResponse.json({
    ok: true,
    websitePostId,
    websitePostUrl,
    authorMode,
    table: "public.posts",
    post: createdPost,
    storage: persistedImages,
  });
}

export async function PATCH(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const discordThreadId = normalizeDiscordId(body.discordThreadId);
  if (!discordThreadId) {
    return NextResponse.json(
      { error: "Discord thread ID is required." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin
    .from("discord_reddit_crosspost_sync")
    .update({
      reddit_post_id: normalizeOptionalString(body.redditPostId, 200),
      reddit_url: normalizeOptionalString(body.redditUrl, 500),
      status: normalizeOptionalString(body.status, 80) ?? "reddit_posted",
      error: normalizeOptionalString(body.error, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("discord_thread_id", discordThreadId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
