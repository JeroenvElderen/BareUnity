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

export async function buildGallerySnapshotPayload(): Promise<GallerySnapshotItem[]> {
  const rows = await db.posts.findMany({
    where: {
      media_url: { not: null },
      OR: [{ post_type: null }, { post_type: { not: "story" } }],
    },
    orderBy: { created_at: "desc" },
    take: 48,
    select: {
      id: true,
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

  return rows
    .filter((row) => Boolean(row.media_url?.trim()))
    .map((row) => ({
      id: `post-${row.id}`,
      title: row.title?.trim() || "Untitled capture",
      place: row.profiles?.location?.trim() || row.profiles?.username || "BareUnity Community",
      src: toPublicMediaUrl(row.media_url!.trim()),
    }));
}

export async function getGallerySnapshotSourceVersion(): Promise<string> {
  const latestPost = await db.posts.findFirst({
    where: {
      media_url: { not: null },
      OR: [{ post_type: null }, { post_type: { not: "story" } }],
    },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });

  return `${latestPost?.id ?? "-"}|${latestPost?.created_at?.toISOString() ?? "-"}`;
}
