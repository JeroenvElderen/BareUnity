"use client";

import { useEffect, useRef, useState, type ChangeEventHandler } from "react";
import { Heart } from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { buildUserScopedCacheKey, loadCachedThenRefresh } from "@/lib/client-cache";
import layoutStyles from "../page.module.css";
import styles from "./gallery.module.css";
import { supabase } from "@/lib/supabase";

type GalleryItem = {
  id: string;
  title: string;
  place: string;
  username: string;
  path: string;
  src: string;
  likeCount: number;
  likedByViewer: boolean;
};

const GALLERY_CACHE_MAX_AGE_MS = 1000 * 60 * 15;
const DOUBLE_TAP_WINDOW_MS = 300;
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

async function convertImageToWebp(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Could not process this image."));
      nextImage.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image conversion is unavailable in this browser.");
    }

    context.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (generatedBlob) => {
          if (!generatedBlob) {
            reject(new Error("Could not convert image to WEBP."));
            return;
          }

          resolve(generatedBlob);
        },
        "image/webp",
        0.9,
      );
    });

    const webpName = file.name.replace(/\.[^.]+$/, "") || "gallery-image";
    return new File([blob], `${webpName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastTapByItemIdRef = useRef<Record<string, number>>({});

  const refreshGallery = async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? null;
    const accessToken = data.session?.access_token ?? null;
    const cacheKey = buildUserScopedCacheKey("gallery-items", userId);

    return loadCachedThenRefresh<GalleryItem[]>({
      key: cacheKey,
      maxAgeMs: GALLERY_CACHE_MAX_AGE_MS,
      fetchFresh: () => fetchGallerySnapshot(accessToken),
    });
  };

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

  useEffect(() => {
    if (!activeItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveItem(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeItem]);

  const handleUpload: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in before uploading.");
      }

      const convertedFile = await convertImageToWebp(selectedFile);
      const payload = new FormData();
      payload.append("image", convertedFile);

      const response = await fetch("/api/gallery/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: payload,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Upload failed.");
      }

      const nextItems = await refreshGallery();
      setItems(nextItems);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const setLikePending = (itemId: string, isPending: boolean) => {
    setPendingLikeIds((current) => {
      const next = new Set(current);
      if (isPending) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }

      return next;
    });
  };

  const toggleLike = async (itemId: string) => {
    const target = items.find((item) => item.id === itemId);
    if (!target || pendingLikeIds.has(itemId)) return;

    const nextLiked = !target.likedByViewer;
    const optimisticCount = Math.max(0, target.likeCount + (nextLiked ? 1 : -1));

    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              likedByViewer: nextLiked,
              likeCount: optimisticCount,
            }
          : item,
      ),
    );
    setLikePending(itemId, true);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in to like images.");
      }

      const response = await fetch("/api/gallery/like", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imagePath: target.path,
          liked: nextLiked,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not update like.");
      }

      const body = (await response.json()) as { likeCount?: number; likedByViewer?: boolean };
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                likeCount: Number(body.likeCount ?? optimisticCount),
                likedByViewer: body.likedByViewer === true,
              }
            : item,
        ),
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not update like.");
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                likedByViewer: target.likedByViewer,
                likeCount: target.likeCount,
              }
            : item,
        ),
      );
    } finally {
      setLikePending(itemId, false);
    }
  };

  const handleImageTouchEnd = (itemId: string) => {
    const now = Date.now();
    const previousTap = lastTapByItemIdRef.current[itemId] ?? 0;
    const isDoubleTap = now - previousTap <= DOUBLE_TAP_WINDOW_MS;

    lastTapByItemIdRef.current[itemId] = now;

    if (!isDoubleTap) return;
    const target = items.find((item) => item.id === itemId);
    if (!target || target.likedByViewer) return;
    void toggleLike(itemId);
  };

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.wrapper}>
      <header className={styles.galleryHeader}>
          <h1 className={styles.galleryTitle}>Gallery</h1>
          <p className={styles.gallerySubtitle}>Fresh captures from the BareUnity community.</p>
          <div className={styles.uploadAction}>
            <label className={styles.uploadButton} aria-disabled={isUploading}>
              <input
                type="file"
                accept="image/*"
                className={styles.uploadInput}
                onChange={handleUpload}
                disabled={isUploading}
              />
              {isUploading ? "Uploading…" : "+"}
            </label>
          </div>
        </header>
        {uploadError ? <p className={styles.uploadError}>{uploadError}</p> : null}
        {!isLoading && items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No gallery media found yet.</p>
            <small>Upload an image with + (automatically converted to WEBP) or add files to media storage.</small>
          </div>
        ) : (
          <div className={styles.galleryFlow}>
            {items.map((item, index) => (
              <figure
                key={item.id}
                className={`${styles.tile} ${
                  styles[TILE_SIZE_VARIANTS[hashString(item.id) % TILE_SIZE_VARIANTS.length]]
                }`}
              >
                <button
                  type="button"
                  className={styles.media}
                  onClick={() => setActiveItem(item)}
                  aria-label={`View ${item.title} in full screen`}
                >
                  <img
                    src={item.src}
                    alt={`${item.title} — ${item.place}`}
                    className={styles.image}
                    loading={index < 6 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    onTouchEnd={() => handleImageTouchEnd(item.id)}
                  />
                </button>
                <figcaption className={styles.metaBar}>
                  <button
                    type="button"
                    className={`${styles.likeButton} ${item.likedByViewer ? styles.likeButtonActive : ""}`}
                    aria-label={item.likedByViewer ? `Unlike ${item.title}` : `Like ${item.title}`}
                    aria-pressed={item.likedByViewer}
                    onClick={() => void toggleLike(item.id)}
                    disabled={pendingLikeIds.has(item.id)}
                  >
                    <Heart className={styles.likeIcon} />
                    <span className={styles.likeCount}>{item.likeCount}</span>
                  </button>
                <span className={styles.username}>@{item.username}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
      {activeItem ? (
        <div
          className={styles.fullscreenOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`${activeItem.title} full screen preview`}
          onClick={() => setActiveItem(null)}
        >
          <button
            type="button"
            className={styles.fullscreenClose}
            onClick={() => setActiveItem(null)}
            aria-label="Close full screen image"
          >
            ×
          </button>
          <img
            src={activeItem.src}
            alt={`${activeItem.title} — ${activeItem.place}`}
            className={styles.fullscreenImage}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}