import type { CSSProperties } from "react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";
import styles from "./gallery.module.css";

type GalleryRow = {
  id: string;
  title: string | null;
  media_url: string | null;
  created_at: string | null;
  profiles: {
    username: string;
    location: string | null;
  } | null;
};

type GalleryItem = {
  id: string;
  title: string;
  place: string;
  src: string;
};


function resolveStoragePath(rawUrl: string): string | null {
  const value = rawUrl.trim();
  if (!value) return null;

  if (!value.startsWith("http")) {
    return value.startsWith("posts/") ? value : `posts/${value}`;
  }

  const marker = "/storage/v1/object/public/media/";
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return value.slice(markerIndex + marker.length);
  }

  return null;
}

function toPublicMediaUrl(pathOrUrl: string, fallbackClient = supabase): string {
  if (pathOrUrl.startsWith("http")) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith("posts/") ? pathOrUrl : `posts/${pathOrUrl}`;
  const { data } = fallbackClient.storage.from("media").getPublicUrl(normalizedPath);
  return data.publicUrl;
}

function mapRowsToGalleryItems(rows: GalleryRow[]): GalleryItem[] {
  return rows
    .filter((row) => Boolean(row.media_url))
    .map((row) => {
      const raw = row.media_url as string;
      const storagePath = resolveStoragePath(raw);
      return {
        id: `post-${row.id}`,
        title: row.title?.trim() || "Untitled capture",
        place: row.profiles?.location?.trim() || row.profiles?.username || "BareUnity Community",
        src: storagePath ? toPublicMediaUrl(storagePath) : toPublicMediaUrl(raw),
      };
    });
}

async function getStorageGalleryItems() {
  const client = isSupabaseAdminConfigured ? createSupabaseAdminClient() : supabase;

  const { data: files, error } = await client.storage.from("media").list("posts", {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error || !files) {
    console.error("Failed to list storage media", error);
    return [] as GalleryItem[];
  }

  return files
    .filter((file) => Boolean(file.name) && !file.id?.includes(".emptyFolderPlaceholder"))
    .map((file) => ({
      id: `storage-${file.id ?? file.name}`,
      title: file.name || "Uploaded media",
      place: "Supabase Storage",
      src: toPublicMediaUrl(`posts/${file.name}`),
    }));
}

async function getGalleryItems(): Promise<GalleryItem[]> {
  if (!isSupabaseConfigured && !isSupabaseAdminConfigured) {
    return [];
  }

  const client = isSupabaseAdminConfigured ? createSupabaseAdminClient() : supabase;

  const { data, error } = await client
    .from("posts")
    .select("id,title,media_url,created_at,profiles(username,location)")
    .not("media_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.error("Failed to load gallery posts", error);
  }

  const postItems = mapRowsToGalleryItems((data ?? []) as GalleryRow[]);
  const storageItems = await getStorageGalleryItems();

  const seenSources = new Set(postItems.map((item) => item.src));
  const missingStorageItems = storageItems.filter((item) => !seenSources.has(item.src));

  return [...postItems, ...missingStorageItems].slice(0, 48);
}

export default async function GalleryPage() {
  const galleryItems = await getGalleryItems();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Gallery showcase</p>
          <h1>Discover moments in the wild</h1>
          <p>
            Live gallery content from Supabase posts and storage uploads. Latest uploads appear first.
          </p>
        </header>

        {galleryItems.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No gallery media found yet.</p>
            <small>Upload a post with media or add files to media/posts in Supabase Storage.</small>
          </div>
        ) : (
          <div className={styles.grid}>
            {galleryItems.map((item, index) => (
              <article key={item.id} className={styles.card} style={{ "--index": index } as CSSProperties}>
                <img
                  src={item.src}
                  alt={`${item.title} by ${item.place}`}
                  className={styles.image}
                  loading="lazy"
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}