"use client";

import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { buildUserScopedCacheKey, loadCachedThenRefresh } from "@/lib/client-cache";
import layoutStyles from "../page.module.css";
import styles from "./gallery.module.css";
import { supabase } from "@/lib/supabase";

type GalleryItem = {
  id: string;
  title: string;
  place: string;
  src: string;
};

const GALLERY_CACHE_MAX_AGE_MS = 1000 * 60 * 15;
const TILE_SIZE_VARIANTS = [
  "sizeTall",
  "sizePortrait",
  "sizeSquare",
  "sizeLandscape",
  "sizeWide",
] as const;

function hashString(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
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

  return payload.items ?? [];
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
          <div className={styles.galleryFlow}>
            {items.map((item, index) => (
              <figure
                key={item.id}
                className={`${styles.tile} ${styles[TILE_SIZE_VARIANTS[hashString(item.id) % TILE_SIZE_VARIANTS.length]]}`}
              >
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
