"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Channel, getChannels } from "@/lib/channel-data";

export default function SidebarMenu({ channels: channelsProp }: { channels?: Channel[] }) {
  const pathname = usePathname();
  const channels = useMemo(() => channelsProp ?? getChannels(), [channelsProp]);
  const [channelsOpen, setChannelsOpen] = useState(pathname.startsWith("/channels"));

  return (
    <aside className="h-full rounded-3xl border border-[#242941] bg-[rgba(9,11,19,0.66)] px-4 py-[22px]">
      <div className="mb-[26px] text-[38px] font-bold leading-none tracking-[0.2px]">
        Bare<span className="text-[#7c5cff]">Unity</span>
      </div>

      <nav className="grid gap-2 text-sm" aria-label="Sidebar menu">
        <MenuLink href="/" label="🏠 Home Feed" pathname={pathname} />
        <MenuLink href="/settings" label="⚙️ Settings" pathname={pathname} />
        <MenuLink href="/profile" label="👤 Profile" pathname={pathname} />

        <button
          type="button"
          onClick={() => setChannelsOpen((open) => !open)}
          className={`flex items-center justify-between rounded-xl border px-3 py-[11px] text-left transition ${
            pathname.startsWith("/channels")
              ? "border-[rgba(124,92,255,0.4)] bg-[rgba(124,92,255,0.16)] text-[#eef2ff]"
              : "border-transparent text-[#8e97b8] hover:border-[#2b3150]"
          }`}
        >
          <span>📂 Channels</span>
          <span className="text-xs">{channelsOpen ? "▾" : "▸"}</span>
        </button>

        {channelsOpen ? (
          <div className="ml-3 grid gap-1 border-l border-[#2b3150] pl-3">
            <MenuLink href="/channels" label="All channels" pathname={pathname} compact />
            {channels.map((channel) => (
              <MenuLink key={channel.id} href={`/channels/${channel.id}`} label={channel.name} pathname={pathname} compact />
            ))}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function MenuLink({
  href,
  label,
  pathname,
  compact = false,
}: {
  href: string;
  label: string;
  pathname: string;
  compact?: boolean;
}) {
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 ${compact ? "py-2 text-xs" : "py-[11px]"} transition ${
        isActive
          ? "border-[rgba(124,92,255,0.4)] bg-[rgba(124,92,255,0.16)] text-[#eef2ff]"
          : "border-transparent text-[#8e97b8] hover:border-[#2b3150] hover:text-[#dbe3ff]"
      }`}
    >
      {label}
    </Link>
  );
}