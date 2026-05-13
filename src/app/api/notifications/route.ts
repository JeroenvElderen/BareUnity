import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

const MAX_NOTIFICATIONS = 100;

type NotificationType =
  | "post-like"
  | "post-comment"
  | "gallery-like"
  | "general-message"
  | "map-entry"
  | "friend-request"
  | "admin-report"
  | "admin-registration"
  | "admin-feedback"
  | "admin-location"
  | "admin-verification";

type NotificationResponseItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  type: NotificationType;
  unread: boolean;
  targetHref?: string;
};

type FeedLikeRow = {
  id: string;
  post_id: string;
  created_at: Date;
  actor_name: string | null;
};
type FeedCommentRow = {
  id: string;
  post_id: string;
  created_at: Date;
  actor_name: string | null;
};
type GalleryLikeRow = {
  id: string;
  image_path: string;
  created_at: Date;
  actor_name: string | null;
};
type FriendRequestRow = {
  id: string;
  created_at: Date;
  sender_username: string | null;
};
type GeneralMessageRow = {
  id: string;
  created_at: Date;
  actor_name: string | null;
};
type MapSpotRow = { id: string; name: string | null; created_at: Date };
type AdminReportRow = {
  id: string;
  target_type: string | null;
  created_at: Date;
  actor_name: string | null;
};
type AdminRegistrationRow = {
  id: string;
  created_at: Date;
  actor_name: string | null;
};
type AdminFeedbackRow = {
  id: string;
  category: string | null;
  message: string | null;
  created_at: Date;
};
type AdminVerificationRow = {
  user_id: string;
  created_at: Date;
  display_name: string | null;
  legal_name: string | null;
};

function resolveActorName(
  actorName: string | null | undefined,
  fallback: string,
) {
  const normalized = actorName?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function trimMessage(message: string | null | undefined, fallback: string) {
  const normalized = message?.replace(LOCATION_REQUEST_PREFIX, "").trim();
  if (!normalized) return fallback;
  return normalized.length > 120
    ? `${normalized.slice(0, 117)}...`
    : normalized;
}

export async function GET(request: Request) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found." }, { status: 400 });
  }

  const viewer = await db.users
    .findUnique({ where: { id: viewerId }, select: { email: true } })
    .catch(() => null);
  const isAdmin = isPlatformAdminEmail(viewer?.email);

  const [
    feedLikes,
    feedComments,
    galleryLikes,
    friendRequests,
    generalMessages,
    mapSpots,
  ] = await Promise.all([
    db
      .$queryRaw<Array<FeedLikeRow>>(
        Prisma.sql`
      select pv.id, pv.post_id, pv.created_at, coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.post_votes pv
      inner join public.posts p on p.id = pv.post_id
      left join public.profiles pr on pr.id = pv.user_id
      where p.author_id = ${viewerId}::uuid and pv.user_id <> ${viewerId}::uuid and pv.vote > 0
      order by pv.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `,
      )
      .catch(() => []),
    db
      .$queryRaw<Array<FeedCommentRow>>(
        Prisma.sql`
      select c.id, c.post_id, c.created_at, coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.comments c
      inner join public.posts p on p.id = c.post_id
      left join public.profiles pr on pr.id = c.author_id
      where p.author_id = ${viewerId}::uuid and c.author_id <> ${viewerId}::uuid
      order by c.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `,
      )
      .catch(() => []),
    db
      .$queryRaw<Array<GalleryLikeRow>>(
        Prisma.sql`
      select gil.id, gil.image_path, gil.created_at, coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.gallery_image_likes gil
      left join public.profiles pr on pr.id = gil.user_id
      where gil.user_id <> ${viewerId}::uuid
        and (gil.image_path like ${`gallery/${viewerId}/%`} or gil.image_path like ${`%/gallery/${viewerId}/%`})
      order by gil.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `,
      )
      .catch(() => []),
    db
      .$queryRaw<Array<FriendRequestRow>>(
        Prisma.sql`
      select id, created_at, sender_username
      from public.friend_requests
      where receiver_id = ${viewerId}::uuid and status = 'pending'
      order by created_at desc
      limit ${MAX_NOTIFICATIONS}
    `,
      )
      .catch(() => []),
    db
      .$queryRaw<Array<GeneralMessageRow>>(
        Prisma.sql`
      select cm.id, cm.created_at, coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.channel_messages cm
      inner join public.channels ch on ch.id = cm.channel_id and ch.slug = 'general'
      left join public.profiles pr on pr.id = cm.author_id
      where cm.author_id <> ${viewerId}::uuid
      order by cm.created_at desc
      limit 25
    `,
      )
      .catch(() => []),
    db
      .$queryRaw<Array<MapSpotRow>>(
        Prisma.sql`
      select id, name, created_at
      from public.naturist_map_spots
      where submitted_by is distinct from ${viewerId}::uuid
      order by created_at desc
      limit 25
    `,
      )
      .catch(() => []),
  ]);

  let adminNotifications: NotificationResponseItem[] = [];

  if (isAdmin) {
    const [
      reports,
      registrations,
      feedback,
      locationRequests,
      verificationRequests,
    ] = await Promise.all([
      db
        .$queryRaw<Array<AdminReportRow>>(
          Prisma.sql`
        select r.id, r.target_type, r.created_at, coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
        from public.reports r
        left join public.profiles pr on pr.id = r.reporter_id
        order by r.created_at desc
        limit ${MAX_NOTIFICATIONS}
      `,
        )
        .catch(() => []),
      db
        .$queryRaw<Array<AdminRegistrationRow>>(
          Prisma.sql`
        select p.id, p.created_at, coalesce(nullif(p.display_name, ''), p.username) as actor_name
        from public.profiles p
        order by p.created_at desc
        limit 25
      `,
        )
        .catch(() => []),
      db
        .$queryRaw<Array<AdminFeedbackRow>>(
          Prisma.sql`
        select id, category, message, created_at
        from public.feedback_messages
        where message not like ${`${LOCATION_REQUEST_PREFIX}%`}
        order by created_at desc
        limit ${MAX_NOTIFICATIONS}
      `,
        )
        .catch(() => []),
      db
        .$queryRaw<Array<AdminFeedbackRow>>(
          Prisma.sql`
        select id, category, message, created_at
        from public.feedback_messages
        where message like ${`${LOCATION_REQUEST_PREFIX}%`}
        order by created_at desc
        limit ${MAX_NOTIFICATIONS}
      `,
        )
        .catch(() => []),
      db
        .$queryRaw<Array<AdminVerificationRow>>(
          Prisma.sql`
        select user_id, created_at, display_name, legal_name
        from public.verification_submissions
        where status = 'pending'
        order by created_at desc
        limit ${MAX_NOTIFICATIONS}
      `,
        )
        .catch(() => []),
    ]);

    adminNotifications = [
      ...reports.map((row) => ({
        id: `admin-report-${row.id}`,
        title: "New report",
        detail: `${resolveActorName(row.actor_name, "Someone")} reported ${row.target_type ?? "content"}.`,
        timestamp: toIso(row.created_at),
        type: "admin-report" as const,
        unread: true,
        targetHref: "/admin/reports",
      })),
      ...registrations.map((row) => ({
        id: `admin-registration-${row.id}`,
        title: "New registration",
        detail: `${resolveActorName(row.actor_name, "A new member")} created an account.`,
        timestamp: toIso(row.created_at),
        type: "admin-registration" as const,
        unread: true,
        targetHref: "/admin/users",
      })),
      ...feedback.map((row) => ({
        id: `admin-feedback-${row.id}`,
        title: "New feedback",
        detail: trimMessage(
          row.message,
          `A new ${row.category ?? "feedback"} message needs review.`,
        ),
        timestamp: toIso(row.created_at),
        type: "admin-feedback" as const,
        unread: true,
        targetHref: "/admin/feedback",
      })),
      ...locationRequests.map((row) => ({
        id: `admin-location-${row.id}`,
        title: "New location request",
        detail: trimMessage(
          row.message,
          "A member submitted a location request.",
        ),
        timestamp: toIso(row.created_at),
        type: "admin-location" as const,
        unread: true,
        targetHref: "/admin/locations",
      })),
      ...verificationRequests.map((row) => ({
        id: `admin-verification-${row.user_id}`,
        title: "New verification request",
        detail: `${resolveActorName(row.display_name ?? row.legal_name, "A member")} is waiting for verification review.`,
        timestamp: toIso(row.created_at),
        type: "admin-verification" as const,
        unread: true,
        targetHref: "/admin/applications",
      })),
    ];
  }

  const notifications: NotificationResponseItem[] = [
    ...feedLikes.map((row) => ({
      id: `post-like-${row.id}`,
      title: "New like on your post",
      detail: `${resolveActorName(row.actor_name, "Someone")} liked your post.`,
      timestamp: toIso(row.created_at),
      type: "post-like" as const,
      unread: true,
      targetHref: `/?postId=${row.post_id}`,
    })),
    ...feedComments.map((row) => ({
      id: `post-comment-${row.id}`,
      title: "New comment on your post",
      detail: `${resolveActorName(row.actor_name, "Someone")} commented on your post.`,
      timestamp: toIso(row.created_at),
      type: "post-comment" as const,
      unread: true,
      targetHref: `/?postId=${row.post_id}`,
    })),
    ...galleryLikes.map((row) => ({
      id: `gallery-like-${row.id}`,
      title: "New gallery like",
      detail: `${resolveActorName(row.actor_name, "Someone")} liked one of your gallery uploads.`,
      timestamp: toIso(row.created_at),
      type: "gallery-like" as const,
      unread: true,
      targetHref: `/gallery?imagePath=${encodeURIComponent(row.image_path)}`,
    })),
    ...friendRequests.map((row) => ({
      id: `friend-request-${row.id}`,
      title: "New friend request",
      detail: `${resolveActorName(row.sender_username, "Someone")} sent you a friend request.`,
      timestamp: toIso(row.created_at),
      type: "friend-request" as const,
      unread: true,
      targetHref: "/members",
    })),
    ...generalMessages.map((row) => ({
      id: `general-message-${row.id}`,
      title: "New message in #general",
      detail: `${resolveActorName(row.actor_name, "Someone")} posted in General Room.`,
      timestamp: toIso(row.created_at),
      type: "general-message" as const,
      unread: true,
      targetHref: "/discussion",
    })),
    ...mapSpots.map((row) => ({
      id: `map-entry-${row.id}`,
      title: "New map entry",
      detail: `${row.name ?? "A new location"} was added to the map.`,
      timestamp: toIso(row.created_at),
      type: "map-entry" as const,
      unread: true,
      targetHref: "/explore",
    })),
    ...adminNotifications,
  ]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, MAX_NOTIFICATIONS);

  return NextResponse.json({ notifications });
}
