import { Prisma } from "@prisma/client";
import { db } from "@/server/db";

export const DISCORD_CASE_MANAGEMENT_CHANNEL_ID =
  process.env.DISCORD_CASE_MANAGEMENT_CHANNEL_ID ?? "1517154128541909152";

export const DISCORD_GALLERY_REVIEW_CHANNEL_ID =
  process.env.DISCORD_GALLERY_REVIEW_CHANNEL_ID ??
  "1517153973835010139";

export const DISCORD_GALLERY_REVIEW_TARGETS = [
  "nude-gallery",
  "general-gallery",
  "reject-gallery-image",
] as const;

export const DISCORD_POST_TARGET_CHANNELS = {
  photoSharing:
    process.env.DISCORD_PHOTO_SHARING_FORUM_ID ??
    process.env.DISCORD_PHOTO_SHARING_CHANNEL_ID ??
    "photo-sharing",
  naturistTravel:
    process.env.DISCORD_NATURIST_TRAVEL_FORUM_ID ??
    process.env.DISCORD_NATURIST_TRAVEL_CHANNEL_ID ??
    "naturist-travel",
} as const;

export type DiscordPostTarget = keyof typeof DISCORD_POST_TARGET_CHANNELS;
export const DISCORD_SKIP_TARGET = "skip" as const;
export const DISCORD_DELETE_TARGET = "delete-post" as const;

export async function findDiscordSyncForWebsitePost(postId: string) {
  const rows = await db.$queryRaw<
    Array<{
      discord_thread_id: string | null;
      discord_channel_id: string | null;
      target_discord_channel_id: string | null;
      website_post_id: string | null;
    }>
  >(Prisma.sql`
    select discord_thread_id, discord_channel_id, target_discord_channel_id, website_post_id
    from public.discord_reddit_crosspost_sync
    where website_post_id = ${postId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function enqueueDiscordSyncEvent(args: {
  websitePostId: string | null;
  galleryImagePath?: string | null;
  eventType:
    | "website_post_created"
    | "website_comment_created"
    | "website_like_created"
    | "website_like_removed"
    | "gallery_image_review_requested";
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
  discordThreadId?: string | null;
}) {
  await db.$executeRaw(Prisma.sql`
    insert into public.discord_crosspost_events (
      website_post_id,
      gallery_image_path,
      discord_thread_id,
      event_type,
      payload,
      dedupe_key
    ) values (
      ${args.websitePostId}::uuid,
      ${args.galleryImagePath ?? null},
      ${args.discordThreadId ?? null},
      ${args.eventType},
      ${args.payload}::jsonb,
      ${args.dedupeKey}
    )
    on conflict (dedupe_key) do nothing
  `);
}

export async function enqueueDiscordGalleryReviewEvent(args: {
  imagePath: string;
  ownerId?: string | null;
  title?: string | null;
  source: "gallery_upload" | "homefeed_upload" | "discord_crosspost";
  publicUrl?: string | null;
  signedUrl?: string | null;
  websitePostId?: string | null;
  discordThreadId?: string | null;
}) {
  await enqueueDiscordSyncEvent({
    websitePostId: args.websitePostId ?? null,
    galleryImagePath: args.imagePath,
    discordThreadId: args.discordThreadId ?? null,
    eventType: "gallery_image_review_requested",
    dedupeKey: `gallery-review:${args.imagePath}`,
    payload: {
      imagePath: args.imagePath,
      ownerId: args.ownerId ?? null,
      title: args.title ?? null,
      source: args.source,
      reviewChannelId: DISCORD_GALLERY_REVIEW_CHANNEL_ID,
      galleryButtons: [...DISCORD_GALLERY_REVIEW_TARGETS],
      publicUrl: args.publicUrl ?? null,
      signedUrl: args.signedUrl ?? null,
      websitePostId: args.websitePostId ?? null,
      discordThreadId: args.discordThreadId ?? null,
    },
  });
}

export async function ensureWebsitePostQueuedForDiscord(postId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; title: string | null; content: string | null; media_url: string | null; media_urls: string[] | null; author_id: string | null }>>(Prisma.sql`
    select id, title, content, media_url, media_urls, author_id
    from public.posts
    where id = ${postId}::uuid
    limit 1
  `);
  const post = rows[0];
  if (!post) return;

  const existing = await findDiscordSyncForWebsitePost(postId).catch(() => null);
  if (existing?.discord_thread_id) return;

  await db.$executeRaw(Prisma.sql`
    insert into public.discord_reddit_crosspost_sync (
      website_post_id,
      website_post_url,
      target_discord_channel_id,
      status,
      author_mode,
      updated_at
    ) values (
      ${postId}::uuid,
      ${buildWebsitePostUrl(postId)},
      ${DISCORD_CASE_MANAGEMENT_CHANNEL_ID},
      'pending_discord_review',
      'website_user',
      now()
    )
    on conflict (website_post_id) do nothing
  `);

  await enqueueDiscordSyncEvent({
    websitePostId: postId,
    eventType: "website_post_created",
    dedupeKey: `website-post:${postId}`,
    payload: {
      postId,
      title: post.title,
      content: post.content,
      mediaUrl: post.media_url,
      mediaUrls: post.media_urls ?? [],
      authorId: post.author_id,
      caseManagementChannelId: DISCORD_CASE_MANAGEMENT_CHANNEL_ID,
      targetButtons: [
        "photo-sharing",
        "naturist-travel",
        "skip-discord-upload",
        "delete-post",
      ],
    },
  });
}

export function buildWebsitePostUrl(postId: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://bareunity.com";
  return `${siteUrl.replace(/\/$/, "")}/?postId=${postId}`;
}
