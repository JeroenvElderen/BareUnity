"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Channel, getInitials, readChannelsFromSupabase } from "@/lib/channel-data";

type SidebarProps = {
  onChannelSelect?: (channel: Channel) => void;
  selectedChannelId?: string | null;
};

export default function Sidebar({ onChannelSelect, selectedChannelId = null }: SidebarProps) {
  const pathname = usePathname();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      const rows = await readChannelsFromSupabase();
      if (isMounted) setChannels(rows);
    }

    loadChannels();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const sidebarWidth = useMemo(() => {
    const longestChannelNameLength = channels.reduce((maxLength, channel) => Math.max(maxLength, channel.name.length), 0);
    const widthInCh = Math.max(longestChannelNameLength + 8, 18);

    return `clamp(12rem, ${widthInCh}ch, 28rem)`;
  }, [channels]);

  const sidebarStyle = { "--sidebar-width": sidebarWidth } as CSSProperties;

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
        style={sidebarStyle}
        className={`fixed left-0 top-16 z-30 flex h-[calc(100vh-64px)] w-[var(--sidebar-width)] flex-col items-stretch border-r border-accent/20 bg-bg/92 px-3 py-5 transition-transform duration-200 md:translate-x-0 ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:flex`}
      >
        <div className="glass-pill mb-5 self-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">Nature Hubs</div>
        <div className="mt-1 flex w-full flex-col gap-2">
          {channels.map((channel) => (
            onChannelSelect ? (
              <button
                key={channel.id}
                type="button"
                className={`glass-input group relative flex h-11 w-full items-center gap-2 overflow-hidden rounded-2xl px-3 text-left text-sm font-semibold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/60 ${
                  selectedChannelId === channel.id ? "border-accent/70" : ""
                }`}
                title={channel.name}
                onClick={() => {
                  onChannelSelect(channel);
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-accent/30 text-[11px] font-bold uppercase text-text/90">
                  {channel.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={channel.iconUrl} alt={`${channel.name} icon`} className="h-full w-full object-cover" />
                  ) : (
                    getInitials(channel.name) || "#"
                  )}
                </span>
                <span className="whitespace-nowrap">{channel.name}</span>
              </button>
            ) : (
              <Link
                key={channel.id}
                href={`/channels/${channel.id}`}
                className="glass-input group relative flex h-11 w-full items-center gap-2 overflow-hidden rounded-2xl px-3 text-sm font-semibold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/60"
                title={channel.name}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-accent/30 text-[11px] font-bold uppercase text-text/90">
                  {channel.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={channel.iconUrl} alt={`${channel.name} icon`} className="h-full w-full object-cover" />
                  ) : (
                    getInitials(channel.name) || "#"
                  )}
                </span>
                <span className="whitespace-nowrap">{channel.name}</span>
              </Link>
            )
          ))}
        </div>
      </aside>

      <div style={sidebarStyle} className="hidden w-[var(--sidebar-width)] shrink-0 md:block" aria-hidden />
    </>
  );
}
