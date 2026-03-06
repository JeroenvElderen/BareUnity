"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COMMUNITY_STORAGE_KEY, Community, getInitials } from "@/lib/community-data";

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
      <aside className="fixed left-0 top-16 z-50 flex h-[calc(100vh-64px)] w-16 flex-col items-center border-r border-sand/20 bg-pine-2/85 px-2 py-3 backdrop-blur-xl">
        <div className="mt-2 flex w-full flex-col items-center gap-2">
          {communities.map((community) => (
            <Link key={community.id} href={`/communities/${community.id}`} className="group relative" title={community.name}>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl border text-xs font-bold text-white transition-all duration-200 group-hover:opacity-85"
                style={{ backgroundColor: community.theme.primary, borderColor: `${community.theme.primary}aa` }}
              >
                {getInitials(community.name)}
              </span>
            </Link>
          ))}
        </div>
        <div className="h-8 w-8" aria-hidden />
      </aside>

      <div className="w-16 shrink-0" aria-hidden />
    </>
  );
}
