"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Channel, getChannels } from "@/lib/channel-data";

const settingsItems = [
  { label: "Account", href: "/settings?tab=account" },
  { label: "Profile", href: "/settings?tab=profile" },
  { label: "Privacy", href: "/settings?tab=privacy" },
  { label: "Preferences", href: "/settings?tab=preferences" },
  { label: "Notifications", href: "/settings?tab=notifications" },
  { label: "Email", href: "/settings?tab=email" },
];

const profileItems = [
  { label: "Overview", href: "/profile?tab=overview" },
  { label: "Posts", href: "/profile?tab=posts" },
  { label: "Comments", href: "/profile?tab=comments" },
  { label: "Gallery", href: "/profile?tab=gallery" },
  { label: "Upvoted", href: "/profile?tab=upvoted" },
  { label: "Settings", href: "/profile?tab=settings" },
];

export default function SidebarMenu({ channels: channelsProp }: { channels?: Channel[] }) {
  const pathname = usePathname();
  const channels = useMemo(() => channelsProp ?? getChannels(), [channelsProp]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(pathname.startsWith("/channels"));
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));
  const [profileOpen, setProfileOpen] = useState(pathname.startsWith("/profile"));

  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#2b3150] bg-[#121522]"
          aria-label="Open sidebar menu"
        >
          <span className="flex flex-col gap-1">
            <span className="h-[2px] w-5 rounded-full bg-[#dce2ff]" />
            <span className="h-[2px] w-5 rounded-full bg-[#dce2ff]" />
            <span className="h-[2px] w-5 rounded-full bg-[#dce2ff]" />
          </span>
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-[#06070d]/70 backdrop-blur-sm" aria-label="Close sidebar" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[84vw] max-w-[340px] p-3">
            <div className="h-full overflow-y-auto rounded-3xl border border-[#242941] bg-[linear-gradient(180deg,#0f1222_0%,#070b15_100%)] p-4">
              <SidebarBody
                pathname={pathname}
                channels={channels}
                channelsOpen={channelsOpen}
                settingsOpen={settingsOpen}
                profileOpen={profileOpen}
                onToggleChannels={() => setChannelsOpen((open) => !open)}
                onToggleSettings={() => setSettingsOpen((open) => !open)}
                onToggleProfile={() => setProfileOpen((open) => !open)}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <aside className="hidden h-full rounded-3xl border border-[#242941] bg-[linear-gradient(180deg,#0f1222_0%,#070b15_100%)] px-4 py-[22px] lg:block">
        <SidebarBody
          pathname={pathname}
          channels={channels}
          channelsOpen={channelsOpen}
          settingsOpen={settingsOpen}
          profileOpen={profileOpen}
          onToggleChannels={() => setChannelsOpen((open) => !open)}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          onToggleProfile={() => setProfileOpen((open) => !open)}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  pathname,
  channels,
  channelsOpen,
  settingsOpen,
  profileOpen,
  onToggleChannels,
  onToggleSettings,
  onToggleProfile,
  onNavigate,
}: {
  pathname: string;
  channels: Channel[];
  channelsOpen: boolean;
  settingsOpen: boolean;
  profileOpen: boolean;
  onToggleChannels: () => void;
  onToggleSettings: () => void;
  onToggleProfile: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-[26px] text-[38px] font-bold leading-none tracking-[0.2px]">
        Bare<span className="text-[#7c5cff]">Unity</span>
      </div>

      <nav className="grid gap-2 text-sm" aria-label="Sidebar menu">
       <MenuLink href="/" label="🏠 Home Feed" pathname={pathname} onNavigate={onNavigate} />

        <Dropdown
          label="⚙️ Settings"
          isActive={pathname.startsWith("/settings")}
          isOpen={settingsOpen}
          onToggle={onToggleSettings}
        >
          {settingsItems.map((item) => (
            <MenuLink key={item.href} href={item.href} label={item.label} pathname={pathname} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>

        <Dropdown
          label="👤 Profile"
          isActive={pathname.startsWith("/profile")}
          isOpen={profileOpen}
          onToggle={onToggleProfile}
        >
          {profileItems.map((item) => (
            <MenuLink key={item.href} href={item.href} label={item.label} pathname={pathname} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>

        <Dropdown
          label="📂 Channels"
          isActive={pathname.startsWith("/channels")}
          isOpen={channelsOpen}
          onToggle={onToggleChannels}
        >
          <MenuLink href="/channels" label="All channels" pathname={pathname} compact onNavigate={onNavigate} />
          {channels.map((channel) => (
            <MenuLink key={channel.id} href={`/channels/${channel.id}`} label={channel.name} pathname={pathname} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>
      </nav>
    </>
  );
}

function Dropdown({
  label,
  isOpen,
  isActive,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  children: import("react").ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-[11px] text-left transition ${
          isActive
            ? "border-[rgba(124,92,255,0.55)] bg-[rgba(124,92,255,0.2)] text-[#eef2ff]"
            : "border-transparent text-[#8e97b8] hover:border-[#2b3150]"
        }`}
      >
        <span>{label}</span>
        <span className="text-xs">{isOpen ? "▾" : "▸"}</span>
      </button>

      {isOpen ? <div className="ml-3 mt-1 grid gap-1 border-l border-[#2b3150] pl-3">{children}</div> : null}
    </div>
  );
}

function MenuLink({
  href,
  label,
  pathname,
  compact = false,
  onNavigate,
}: {
  href: string;
  label: string;
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const cleanHref = href.split("?")[0];
  const isActive = cleanHref === "/" ? pathname === "/" : pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
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