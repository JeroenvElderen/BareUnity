import { Prisma } from "@prisma/client";

import { findGalleryPreferences } from "@/lib/profile-settings-compat";
import { db } from "@/server/db";

export type GallerySnapshotItem = {
  id: string;
  title: string;
  place: string;
  src: string;
};

const EMPTY_GALLERY: GallerySnapshotItem[] = [];

function toPublicMediaUrl(pathOrUrl: string): string {
  const value = pathOrUrl.trim();
  if (value.startsWith("http")) return value;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return value;

  const normalizedPath = value.startsWith("posts/") ? value : `posts/${value}`;
  return `${supabaseUrl}/storage/v1/object/public/media/${normalizedPath}`;
}

export async function buildGallerySnapshotPayload(): Promise<
  GallerySnapshotItem[]
> {
  const rows = await db.posts.findMany({
    where: {
      media_url: { not: null },
      OR: [{ post_type: null }, { post_type: { not: "story" } }],
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      author_id: true,
      title: true,
      media_url: true,
      profiles: {
        select: {
          username: true,
          location: true,
        },
      },
    },
  });

  if (!rows.length) return EMPTY_GALLERY;

  const authorIds = Array.from(
    new Set(
      rows
        .map((row) => row.author_id)
        .filter((authorId): authorId is string => Boolean(authorId)),
    ),
  );
  const hiddenAuthorSettings = (await findGalleryPreferences(authorIds)).filter(
    (settings) => settings.add_post_images_to_gallery === false,
  );
  const hiddenAuthorIds = new Set(
    hiddenAuthorSettings.map((settings) => settings.user_id),
  );

  return rows
    .filter((row) => Boolean(row.media_url?.trim()))
    .filter((row) => !row.author_id || !hiddenAuthorIds.has(row.author_id))
    .map((row) => ({
      id: `post-${row.id}`,
      title: row.title?.trim() || "Untitled capture",
      place:
        row.profiles?.location?.trim() ||
        row.profiles?.username ||
        "BareUnity Community",
      src: toPublicMediaUrl(row.media_url!.trim()),
    }));
}

export async function getGallerySnapshotSourceVersion(): Promise<string> {
  const latestPost = await db.$queryRaw<
    Array<{ id: string; created_at: Date | null }>
  >(Prisma.sql`
    select p.id, p.created_at
    from public.posts p
    left join public.profile_settings ps on ps.user_id = p.author_id
    where p.media_url is not null
      and (p.post_type is null or p.post_type <> 'story')
      and coalesce(ps.add_post_images_to_gallery, true)
    order by p.created_at desc
    limit 1
  `);
  const row = latestPost[0];

  return `${row?.id ?? "-"}|${row?.created_at?.toISOString() ?? "-"}`;
}
