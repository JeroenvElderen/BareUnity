"use client";

import { useEffect, useMemo, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-url";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string;
  alt: string;
  fallback: string;
  className?: string;
};

const ABSOLUTE_OR_BROWSER_URL_PATTERN = /^(?:https?:|data:|blob:|\/)/i;

function normalizeAvatarStoragePath(src: string | undefined) {
  const value = src?.trim();
  if (!value || ABSOLUTE_OR_BROWSER_URL_PATTERN.test(value)) return null;
  return value.includes("/") ? value : `avatars/${value}`;
}

function useAvatarSource(src: string | undefined) {
  const storagePath = useMemo(() => normalizeAvatarStoragePath(src), [src]);
  const immediateSrc = useMemo(
    () => (storagePath ? null : resolveMediaUrl(src, { defaultFolder: "avatars" })),
    [src, storagePath],
  );
  const [signedSrc, setSignedSrc] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!storagePath) {
      return () => {
        isActive = false;
      };
    }

    supabase.storage
      .from("media")
      .createSignedUrl(storagePath, 60 * 60 * 24)
      .then(({ data }) => {
        if (isActive && data?.signedUrl) {
          setSignedSrc({ path: storagePath, url: data.signedUrl });
        }
      })
      .catch(() => {
        const fallbackUrl = resolveMediaUrl(storagePath);
        if (isActive && fallbackUrl) {
          setSignedSrc({ path: storagePath, url: fallbackUrl });
        }
      });

    return () => {
      isActive = false;
    };
  }, [storagePath]);

  return signedSrc?.path === storagePath ? signedSrc.url : immediateSrc;
}

export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  const resolvedSrc = useAvatarSource(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shouldShowImage = Boolean(resolvedSrc && failedSrc !== resolvedSrc);

  return (
    <div
      className={cn(
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[rgb(var(--border))]",
        className,
      )}
    >
      {shouldShowImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc!}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(resolvedSrc)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--bg-soft))] text-sm font-semibold text-[rgb(var(--text-strong))]">
          {fallback}
        </div>
      )}
    </div>
  );
}