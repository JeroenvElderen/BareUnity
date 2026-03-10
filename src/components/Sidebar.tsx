"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CHANNEL_WORKSPACE_STORAGE_KEY, ChannelWorkspace } from "@/lib/channel-data";

function readStoredChannelWorkspaces() {
  if (typeof window === "undefined") {
    return [] as ChannelWorkspace[];
  }

  const stored = window.localStorage.getItem(CHANNEL_WORKSPACE_STORAGE_KEY);
  if (!stored) {
    return [] as ChannelWorkspace[];
  }

  try {
    return JSON.parse(stored) as ChannelWorkspace[];
  } catch {
    return [] as ChannelWorkspace[];
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const [channelWorkspaces, setChannelWorkspaces] = useState<ChannelWorkspace[]>(() => []);

  useEffect(() => {
    function refresh() {
      setChannelWorkspaces(readStoredChannelWorkspaces());
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
        <div className="mb-4 rounded-xl border border-accent/20 bg-white/5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Channels</div>
        <div className="mt-2 flex w-full flex-col items-center gap-3">
          {channelWorkspaces.map((workspace) => (
            <Link key={workspace.id} href={`/channels/${workspace.id}`} className="group relative" title={workspace.name}>
              <span
                className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-accent/20 bg-white/5 transition-all duration-200 group-hover:-translate-y-0.5"
                style={{ boxShadow: `0 10px 22px -16px ${workspace.theme.primary}99` }}
              >
                {workspace.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={workspace.logoUrl} alt={`${workspace.name} logo`} className="h-full w-full object-cover" />
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
