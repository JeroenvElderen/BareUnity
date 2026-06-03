"use client";

import { useMemo, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string;
  alt: string;
  fallback: string;
  className?: string;
};

export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  const resolvedSrc = useMemo(() => resolveMediaUrl(src, { defaultFolder: "avatars" }), [src]);
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