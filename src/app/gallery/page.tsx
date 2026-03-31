"use client";

import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { buildUserScopedCacheKey, loadCachedThenRefresh } from "@/lib/client-cache";
import { supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";
import styles from "./gallery.module.css";

type GalleryItem = {
  id: string;
  title: string;
  place: string;
  src: string;
};

const GALLERY_CACHE_MAX_AGE_MS = 1000 * 60 * 15;

function toPublicMediaUrl(pathOrUrl: string): string {
  const baseUrl = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : supabase.storage
        .from("media")
        .getPublicUrl(pathOrUrl.startsWith("posts/") ? pathOrUrl : `posts/${pathOrUrl}`).data
        .publicUrl;

  const url = new URL(baseUrl);
  url.searchParams.set("format", "webp");
  url.searchParams.set("quality", "78");

  return url.toString();
}

async function fetchGallerySnapshot(accessToken?: string | null): Promise<GalleryItem[]> {
  const headers: HeadersInit = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch("/api/gallery/snapshot", {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Gallery snapshot request failed (${response.status})`);
  }

  const payload = (await response.json()) as { items?: GalleryItem[] };

  return (payload.items ?? []).map((item) => ({
    ...item,
    src: toPublicMediaUrl(item.src),
  }));
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      const accessToken = data.session?.access_token ?? null;
      const cacheKey = buildUserScopedCacheKey("gallery-items", userId);

      try {
        const next = await loadCachedThenRefresh<GalleryItem[]>({
          key: cacheKey,
          maxAgeMs: GALLERY_CACHE_MAX_AGE_MS,
          onCachedData: (cached) => {
            if (!mounted) return;
            setItems(cached);
            setIsLoading(false);
          },
          fetchFresh: () => fetchGallerySnapshot(accessToken),
        });

        if (!mounted) return;
        setItems(next);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.wrapper}>
        {!isLoading && items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No gallery media found yet.</p>
            <small>Upload a post with media or add files to media/posts in Supabase Storage.</small>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((item, index) => (
              <figure key={item.id} className={styles.tile}>
                <img
                  src={item.src}
                  alt={`${item.title} — ${item.place}`}
                  className={styles.image}
                  loading={index < 6 ? "eager" : "lazy"}
                  decoding="async"
                />
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
