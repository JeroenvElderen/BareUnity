"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./hotels-airbnbs.module.css";

type StayGalleryLightboxProps = {
  gallery: string[];
  listingName: string;
};

const VISIBLE_GALLERY_ITEMS = 5;

export function StayGalleryLightbox({
  gallery,
  listingName,
}: StayGalleryLightboxProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const visibleGalleryItems = useMemo(
    () => gallery.slice(0, VISIBLE_GALLERY_ITEMS),
    [gallery],
  );
  const hiddenImageCount = Math.max(0, gallery.length - VISIBLE_GALLERY_ITEMS);
  const hasMultipleImages = gallery.length > 1;

  const closeLightbox = useCallback(() => setActiveIndex(null), []);
  const showPreviousImage = useCallback(() => {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex;
      return (currentIndex - 1 + gallery.length) % gallery.length;
    });
  }, [gallery.length]);
  const showNextImage = useCallback(() => {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex;
      return (currentIndex + 1) % gallery.length;
    });
  }, [gallery.length]);

  useEffect(() => {
    if (activeIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft" && hasMultipleImages) showPreviousImage();
      if (event.key === "ArrowRight" && hasMultipleImages) showNextImage();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, closeLightbox, hasMultipleImages, showNextImage, showPreviousImage]);

  if (!visibleGalleryItems.length) return null;

  const activeImageIndex = activeIndex ?? 0;
  const activeImageUrl = activeIndex === null ? null : gallery[activeImageIndex];

  return (
    <>
      <section className={styles.galleryModern} aria-label={`${listingName} photos`}>
        {visibleGalleryItems.map((imageUrl, idx) => {
          const isLastVisibleImage = idx === visibleGalleryItems.length - 1;
          const showMoreOverlay = isLastVisibleImage && hiddenImageCount > 0;

          return (
            <figure
              key={`${imageUrl}-${idx}`}
              className={idx === 0 ? styles.heroPhoto : styles.subPhoto}
            >
              <button
                type="button"
                className={styles.photoButton}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Open photo ${idx + 1} of ${gallery.length} for ${listingName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={`${listingName} photo ${idx + 1}`}
                  loading={idx === 0 ? "eager" : "lazy"}
                />
                {showMoreOverlay ? (
                  <span className={styles.morePhotosBadge}>+{hiddenImageCount}</span>
                ) : null}
              </button>
            </figure>
          );
        })}
      </section>

      {activeImageUrl ? (
        <div
          className={styles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`${listingName} photo gallery`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLightbox();
          }}
        >
          <div className={styles.lightboxHeader}>
            <p>
              Photo {activeImageIndex + 1} of {gallery.length}
            </p>
            <button
              type="button"
              className={styles.lightboxCloseButton}
              onClick={closeLightbox}
              aria-label="Close photo gallery"
            >
              ×
            </button>
          </div>

          <div className={styles.lightboxStage}>
            {hasMultipleImages ? (
              <button
                type="button"
                className={`${styles.lightboxNavButton} ${styles.lightboxPreviousButton}`}
                onClick={showPreviousImage}
                aria-label="Show previous photo"
              >
                ‹
              </button>
            ) : null}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImageUrl}
              alt={`${listingName} photo ${activeImageIndex + 1}`}
              className={styles.lightboxImage}
            />

            {hasMultipleImages ? (
              <button
                type="button"
                className={`${styles.lightboxNavButton} ${styles.lightboxNextButton}`}
                onClick={showNextImage}
                aria-label="Show next photo"
              >
                ›
              </button>
            ) : null}
          </div>

          {hasMultipleImages ? (
            <div className={styles.lightboxThumbs} aria-label="Photo thumbnails">
              {gallery.map((imageUrl, idx) => (
                <button
                  type="button"
                  key={`${imageUrl}-thumb-${idx}`}
                  className={
                    idx === activeImageIndex
                      ? `${styles.lightboxThumb} ${styles.lightboxThumbActive}`
                      : styles.lightboxThumb
                  }
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Show photo ${idx + 1}`}
                  aria-current={idx === activeImageIndex ? "true" : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
