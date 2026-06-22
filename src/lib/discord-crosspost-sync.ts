import { Prisma } from "@prisma/client";
import { db } from "@/server/db";

export const DISCORD_CASE_MANAGEMENT_CHANNEL_ID =
  process.env.DISCORD_CASE_MANAGEMENT_CHANNEL_ID ?? "1517154128541909152";

export const DISCORD_GALLERY_REVIEW_CHANNEL_ID =
  process.env.DISCORD_GALLERY_REVIEW_CHANNEL_ID ??
  "1517153973835010139";

export const DISCORD_MEMBER_CARDS_FORUM_ID =
  process.env.DISCORD_MEMBER_CARDS_FORUM_ID ?? "1517155438615859390";

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
    | "gallery_image_review_requested"
    | "member_card_upserted";
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
  bucketId?: string | null;
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
      bucketId: args.bucketId ?? "media",
      discordReview: {
        channelId: DISCORD_GALLERY_REVIEW_CHANNEL_ID,
        mode: "one_image_per_forum_thread",
        deleteThreadAfterDecision: true,
      },
    },
  });
}

const ABSOLUTE_OR_BROWSER_URL_PATTERN = /^(?:https?:|data:|blob:|\/)/i;

function resolveDiscordMediaUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;

  const value = rawUrl.trim();
  if (!value) return null;
  if (ABSOLUTE_OR_BROWSER_URL_PATTERN.test(value)) return value;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return value;

  return `${supabaseUrl}/storage/v1/object/public/media/${value.replace(/^\/+/, "")}`;
}

function resolveDiscordMediaUrls(mediaUrls: string[] | null | undefined, mediaUrl: string | null | undefined) {
  const resolvedUrls = (Array.isArray(mediaUrls) ? mediaUrls : [])
    .map((url) => resolveDiscordMediaUrl(url))
    .filter((url): url is string => Boolean(url));
  const fallbackUrl = resolveDiscordMediaUrl(mediaUrl);
  if (fallbackUrl && !resolvedUrls.includes(fallbackUrl)) resolvedUrls.unshift(fallbackUrl);
  return resolvedUrls;
}

function resolveDiscordAvatarUrl(rawUrl: string | null | undefined) {
  return resolveDiscordMediaUrl(rawUrl);
}

export type DiscordMemberCardPayload = {
  profileId: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  location: string | null;
  registeredFrom: string | null;
  discordUserId: string | null;
  memberCardsForumId: string;
  profileUrl: string | null;
  updatedAt: string;
};

export async function buildDiscordMemberCardPayload(profileId: string): Promise<DiscordMemberCardPayload | null> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      bio: string | null;
      avatar_url: string | null;
      location: string | null;
      created_at: Date | null;
      raw_user_meta_data: Prisma.JsonValue | null;
      discord_user_id: string | null;
    }>
  >(Prisma.sql`
    select
      p.id,
      p.username,
      p.display_name,
      p.bio,
      p.avatar_url,
      p.location,
      p.created_at,
      u.raw_user_meta_data,
      pdi.discord_user_id
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.profile_discord_identities pdi on pdi.profile_id = p.id
    where p.id = ${profileId}::uuid
    limit 1
  `);

  const row = rows[0];
  if (!row) return null;

  const metadata =
    row.raw_user_meta_data && typeof row.raw_user_meta_data === "object" && !Array.isArray(row.raw_user_meta_data)
      ? (row.raw_user_meta_data as Record<string, unknown>)
      : {};
  const registeredFrom =
    typeof metadata.discord_verification_source === "string"
      ? metadata.discord_verification_source
      : typeof metadata.registration_source === "string"
        ? metadata.registration_source
        : typeof metadata.account_access === "string"
          ? metadata.account_access
          : null;
  const metadataDiscordUserId =
    typeof metadata.discord_user_id === "string" ? metadata.discord_user_id : null;

  return {
    profileId: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: resolveDiscordAvatarUrl(row.avatar_url),
    location: row.location,
    registeredFrom,
    discordUserId: row.discord_user_id ?? metadataDiscordUserId,
    memberCardsForumId: DISCORD_MEMBER_CARDS_FORUM_ID,
    profileUrl: row.username ? `${(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://bareunity.com").replace(/\/$/, "")}/members/${encodeURIComponent(row.username)}` : null,
    updatedAt: new Date().toISOString(),
  };
}

export async function enqueueDiscordMemberCardUpsert(profileId: string, reason: string) {
  const payload = await buildDiscordMemberCardPayload(profileId);
  if (!payload) return;

  await enqueueDiscordSyncEvent({
    websitePostId: null,
    eventType: "member_card_upserted",
    dedupeKey: `member-card:${profileId}:${Date.now()}:${crypto.randomUUID()}`,
    payload: {
      ...payload,
      reason,
      renderMode: "discord_embed",
      imageMode: "embed_image_url",
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

  const mediaUrls = resolveDiscordMediaUrls(post.media_urls, post.media_url);

  await enqueueDiscordSyncEvent({
    websitePostId: postId,
    eventType: "website_post_created",
    dedupeKey: `website-post:${postId}`,
    payload: {
      postId,
      title: post.title,
      content: post.content,
      mediaUrl: mediaUrls[0] ?? null,
      mediaUrls,
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
