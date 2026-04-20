import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { db } from "@/server/db";

type GalleryStorageItem = {
  id: string;
  title: string;
  place: string;
  src: string;
  createdAt: string;
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
    .map((entry) => ({
      id: `media-${entry.path}`,
      title: humanizeFileName(entry.path),
      place: "BareUnity Community",
      src: entry.path,
      createdAt: entry.createdAt,
    }));

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
        src: data.signedUrl,
      };
    }),
  );

  return signedItems.filter((item): item is GalleryStorageItem => Boolean(item));
}

export async function GET() {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ items: [] });
    }

    const payload = await buildGalleryFromStorage();
    return NextResponse.json({
      items: payload.map((item) => ({
        id: item.id,
        title: item.title,
        place: item.place,
        src: item.src,
      })),
    });
  } catch (error) {
    console.error("Unable to load gallery snapshot", error);
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
