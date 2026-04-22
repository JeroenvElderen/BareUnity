import Image from "next/image";

import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string;
  alt: string;
  fallback: string;
  className?: string;
};

export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  return (
    <div
      className={cn(
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[rgb(var(--border))]",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <Image
          src={src}
          alt={alt}
          fill
          sizes="64px"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--bg-soft))] text-sm font-semibold text-[rgb(var(--text-strong))]">
          {fallback}
        </div>
      )}
    </div>
  );
}