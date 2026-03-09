"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COMMUNITY_STORAGE_KEY, Community } from "@/lib/community-data";

function readRealCommunitiesOnly() {
  if (typeof window === "undefined") {
    return [] as Community[];
  }

  const stored = window.localStorage.getItem(COMMUNITY_STORAGE_KEY);
  if (!stored) {
    return [] as Community[];
  }

  try {
    return JSON.parse(stored) as Community[];
  } catch {
    return [] as Community[];
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const [communities, setCommunities] = useState<Community[]>(() => []);

  useEffect(() => {
    function refresh() {
      setCommunities(readRealCommunitiesOnly());
    }

    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname]);

  return (
    <>
      <aside className="fixed left-0 top-16 z-20 flex h-[calc(100vh-64px)] w-20 flex-col items-center border-r border-accent/15 bg-bg/45 px-3 py-4 backdrop-blur-xl">
        <div className="mb-4 rounded-xl border border-accent/20 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Hubs</div>
        <div className="mt-2 flex w-full flex-col items-center gap-3">
          {communities.map((community) => (
            <Link key={community.id} href={`/communities/${community.id}`} className="group relative" title={community.name}>
              <span
                className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-accent/20 bg-white/5 transition-all duration-200 group-hover:-translate-y-0.5"
                style={{ boxShadow: `0 10px 22px -16px ${community.theme.primary}99` }}
              >
                {community.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={community.logoUrl} alt={`${community.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full bg-text" aria-hidden />
                )}
              </span>
            </Link>
          ))}
        </div>
      </aside>

      <div className="w-20 shrink-0" aria-hidden />
    </>
  );
}
