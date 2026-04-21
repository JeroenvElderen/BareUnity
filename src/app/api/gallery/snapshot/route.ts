import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type GalleryStorageItem = {
  id: string;
  title: string;
  place: string;
  username: string;
  ownerId: string;
  path: string;
  src: string;
  createdAt: string;
};

type GalleryLikeStats = {
  likeCount: number;
  likedByViewer: boolean;
};

type SupabaseListEntry = {
  name: string;
  id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const IMAGE_EXTENSION_PATTERN = /\.(avif|webp|jpe?g|png|gif)$/i;

function toStoragePath(pathOrUrl: string): string {
  const value = pathOrUrl.trim();
  if (!value) return "";

  if (value.startsWith("http")) {
    try {
      const pathname = new URL(value).pathname;
      const mediaPublicPrefix = "/storage/v1/object/public/media/";
      const mediaPrivatePrefix = "/storage/v1/object/media/";
      const mediaSignPrefix = "/storage/v1/object/sign/media/";

      if (pathname.includes(mediaPublicPrefix)) {
        return decodeURIComponent(pathname.split(mediaPublicPrefix)[1] ?? "");
      }

      if (pathname.includes(mediaPrivatePrefix)) {
        return decodeURIComponent(pathname.split(mediaPrivatePrefix)[1] ?? "");
      }

      if (pathname.includes(mediaSignPrefix)) {
        return decodeURIComponent(pathname.split(mediaSignPrefix)[1] ?? "");
      }
    } catch {
      return "";
    }
  }

  return value.replace(/^\/+/, "");
}

function humanizeFileName(path: string): string {
  const fileName = path.split("/").pop() ?? "Untitled capture";
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[\-_]+/g, " ").trim() || "Untitled capture";
}

async function listAllMediaObjects(): Promise<SupabaseListEntry[]> {
  const supabaseAdmin = createSupabaseAdminClient();
  const queue = [""];
  const files: SupabaseListEntry[] = [];

  while (queue.length > 0) {
    const directory = queue.shift();
    if (directory === undefined) continue;

    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin.storage.from("media").list(directory, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Unable to list media directory ${directory}: ${error.message}`);
      }

      if (!data?.length) break;

      for (const entry of data as SupabaseListEntry[]) {
        const fullPath = directory ? `${directory}/${entry.name}` : entry.name;
        if (entry.metadata === null) {
          queue.push(fullPath);
          continue;
        }

        files.push({ ...entry, name: fullPath });
      }

      if (data.length < 100) break;
      offset += data.length;
    }
  }

  return files;
}

async function buildGalleryFromStorage(): Promise<GalleryStorageItem[]> {
  const [objects, storyRows] = await Promise.all([
    listAllMediaObjects(),
    db.posts.findMany({
      where: { post_type: "story", media_url: { not: null } },
      select: { media_url: true },
    }),
  ]);

  const storyPaths = new Set(
    storyRows
      .map((row) => row.media_url)
      .filter((value): value is string => Boolean(value))
      .map((value) => toStoragePath(value))
      .filter(Boolean),
  );

  const supabaseAdmin = createSupabaseAdminClient();
  const entries = objects
    .map((entry) => ({
      path: entry.name,
      createdAt: entry.created_at ?? entry.updated_at ?? "1970-01-01T00:00:00.000Z",
    }))
    .filter((entry) => IMAGE_EXTENSION_PATTERN.test(entry.path))
    .filter((entry) => !storyPaths.has(entry.path))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => {
      const ownerIdSegment = entry.path.split("/")[1] ?? "";
      const normalizedOwnerId = ownerIdSegment.match(/^[0-9a-fA-F-]{36}$/)?.[0] ?? "";

      return {
        id: `media-${entry.path}`,
        title: humanizeFileName(entry.path),
        place: "BareUnity Community",
        ownerId: normalizedOwnerId,
        path: entry.path,
        src: entry.path,
        createdAt: entry.createdAt,
      };
    });

  const ownerIds = Array.from(
    new Set(entries.map((entry) => entry.ownerId).filter((ownerId) => ownerId.length > 0)),
  );
  const profileRows = ownerIds.length
    ? await db.profiles.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, username: true },
      })
    : [];
  const usernameByOwnerId = new Map(profileRows.map((profile) => [profile.id, profile.username]));

  const signedItems = await Promise.all(
    entries.map(async (entry) => {
      const { data, error } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrl(entry.src, 60 * 60 * 24 * 7, {
          transform: {
            quality: 78,
          },
        });

      if (error || !data?.signedUrl) {
        return null;
      }

      return {
        ...entry,
        username: usernameByOwnerId.get(entry.ownerId) ?? "unknown",
        src: data.signedUrl,
      };
    }),
  );

  return signedItems.filter((item): item is GalleryStorageItem => Boolean(item));
}

async function loadLikeStats(paths: string[], viewerId: string | null): Promise<Map<string, GalleryLikeStats>> {
  if (paths.length === 0) return new Map();

  const likeRows = await db.$queryRaw<Array<{ image_path: string; like_count: number }>>(Prisma.sql`
    select image_path, count(*)::int as like_count
    from public.gallery_image_likes
    where image_path in (${Prisma.join(paths)})
    group by image_path
  `);

  const viewerLikedPaths = viewerId
    ? await db.$queryRaw<Array<{ image_path: string }>>(Prisma.sql`
        select image_path
        from public.gallery_image_likes
        where user_id = ${viewerId}::uuid
          and image_path in (${Prisma.join(paths)})
      `)
    : [];

  const likedByViewer = new Set(viewerLikedPaths.map((row) => row.image_path));
  const likeCountByPath = new Map(likeRows.map((row) => [row.image_path, Number(row.like_count) || 0]));

  return new Map(
    paths.map((path) => [
      path,
      {
        likeCount: likeCountByPath.get(path) ?? 0,
        likedByViewer: likedByViewer.has(path),
      },
    ]),
  );
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ items: [] });
    }

    const viewerId = await loadViewerIdFromRequest(request);
    const payload = await buildGalleryFromStorage();
    const likeStatsByPath = await loadLikeStats(
      payload.map((item) => item.path),
      viewerId,
    );
    
    return NextResponse.json({
      items: payload.map((item) => ({
        id: item.id,
        title: item.title,
        place: item.place,
        username: item.username,
        path: item.path,
        src: item.src,
        likeCount: likeStatsByPath.get(item.path)?.likeCount ?? 0,
        likedByViewer: likeStatsByPath.get(item.path)?.likedByViewer ?? false,
      })),
    });
  } catch (error) {
    console.error("Unable to load gallery snapshot", error);
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
