import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type NotificationResponseItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  type: "post-like" | "post-comment" | "gallery-like";
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

const MAX_NOTIFICATIONS = 100;

function resolveActorName(actorName: string | null | undefined, fallback: string) {
  const normalized = actorName?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export async function GET(request: Request) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found." }, { status: 400 });
  }

  const [feedLikes, feedComments, galleryLikes] = await Promise.all([
    db.$queryRaw<Array<FeedLikeRow>>(Prisma.sql`
      select
        pv.id,
        pv.post_id,
        pv.created_at,
        coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.post_votes pv
      inner join public.posts p on p.id = pv.post_id
      left join public.profiles pr on pr.id = pv.user_id
      where p.author_id = ${viewerId}::uuid
        and pv.user_id <> ${viewerId}::uuid
        and pv.vote > 0
      order by pv.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `).catch(() => []),
    db.$queryRaw<Array<FeedCommentRow>>(Prisma.sql`
      select
        c.id,
        c.post_id,
        c.created_at,
        coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.comments c
      inner join public.posts p on p.id = c.post_id
      left join public.profiles pr on pr.id = c.author_id
      where p.author_id = ${viewerId}::uuid
        and c.author_id <> ${viewerId}::uuid
      order by c.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `).catch(() => []),
    db.$queryRaw<Array<GalleryLikeRow>>(Prisma.sql`
      select
        gil.id,
        gil.image_path,
        gil.created_at,
        coalesce(nullif(pr.display_name, ''), pr.username) as actor_name
      from public.gallery_image_likes gil
      left join public.profiles pr on pr.id = gil.user_id
      where gil.user_id <> ${viewerId}::uuid
        and (
          gil.image_path like ${`gallery/${viewerId}/%`}
          or gil.image_path like ${`%/gallery/${viewerId}/%`}
        )
      order by gil.created_at desc
      limit ${MAX_NOTIFICATIONS}
    `).catch(() => []),
  ]);

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
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_NOTIFICATIONS);

  return NextResponse.json({ notifications });
}