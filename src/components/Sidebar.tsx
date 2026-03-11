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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen((current) => !current)}
        className="glass-pill fixed bottom-5 left-4 z-40 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent md:hidden"
        aria-expanded={isMobileMenuOpen}
        aria-controls="mobile-sidebar-menu"
      >
        {isMobileMenuOpen ? "Close hubs" : "Nature hubs"}
      </button>

      {isMobileMenuOpen && (
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Close sidebar menu backdrop"
          className="fixed inset-0 z-20 bg-[#01050f]/70 md:hidden"
        />
      )}

      <aside
        id="mobile-sidebar-menu"
        className={`fixed left-0 top-16 z-30 flex h-[calc(100vh-64px)] w-24 flex-col items-center md:w-24 xl:w-28 2xl:w-48 border-r border-accent/20 bg-bg/92 px-3 py-5 transition-transform duration-200 md:translate-x-0 ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:flex`}
      >
        <div className="glass-pill mb-5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">Nature Hubs</div>
        <div className="mt-1 flex w-full flex-col items-center gap-3">
          {channelWorkspaces.map((workspace) => (
            <Link key={workspace.id} href={`/channels/${workspace.id}`} className="group relative" title={workspace.name} onClick={() => setIsMobileMenuOpen(false)}>
              <span
                className="glass-input relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent/60"
                style={{ boxShadow: `0 10px 24px -14px ${workspace.theme.primary}aa` }}
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

      <div className="hidden w-24 shrink-0 md:block" aria-hidden />
    </>
  );
}
