"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Channel, getChannels } from "@/lib/channel-data";
import { logoutUser } from "@/lib/logout";

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

export default function SidebarMenu({ channels: channelsProp, onCreatePost }: { channels?: Channel[]; onCreatePost?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-card/90"
          aria-label="Open sidebar menu"
        >
          <span className="flex flex-col gap-1">
            <span className="h-0.5 w-5 rounded-full bg-text" />
            <span className="h-0.5 w-5 rounded-full bg-text" />
            <span className="h-0.5 w-5 rounded-full bg-text" />
          </span>
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-bg-deep/70 backdrop-blur-sm" aria-label="Close sidebar" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[84vw] max-w-85 p-3">
            <div className="h-full overflow-y-auto rounded-3xl border border-accent/20 bg-[linear-gradient(180deg,rgb(var(--card)/0.95)_0%,rgb(var(--bg-deep)/0.96)_100%)] p-4">
              <SidebarBody
                pathname={pathname}
                searchParams={searchParams}
                channels={channels}
                channelsOpen={channelsOpen}
                settingsOpen={settingsOpen}
                profileOpen={profileOpen}
                onToggleChannels={() => setChannelsOpen((open) => !open)}
                onToggleSettings={() => setSettingsOpen((open) => !open)}
                onToggleProfile={() => setProfileOpen((open) => !open)}
                onNavigate={() => setMobileOpen(false)}
                onCreatePost={() => {
                  onCreatePost?.();
                  setMobileOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <aside className="hidden h-full rounded-3xl border border-accent/20 bg-[linear-gradient(180deg,rgb(var(--card)/0.95)_0%,rgb(var(--bg-deep)/0.96)_100%)] px-4 py-5.5 lg:block">
        <SidebarBody
          pathname={pathname}
          searchParams={searchParams}
          channels={channels}
          channelsOpen={channelsOpen}
          settingsOpen={settingsOpen}
          profileOpen={profileOpen}
          onToggleChannels={() => setChannelsOpen((open) => !open)}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          onToggleProfile={() => setProfileOpen((open) => !open)}
          onCreatePost={onCreatePost}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  pathname,
  searchParams,
  channels,
  channelsOpen,
  settingsOpen,
  profileOpen,
  onToggleChannels,
  onToggleSettings,
  onToggleProfile,
  onNavigate,
  onCreatePost,
}: {
  pathname: string;
  searchParams: { get: (key: string) => string | null };
  channels: Channel[];
  channelsOpen: boolean;
  settingsOpen: boolean;
  profileOpen: boolean;
  onToggleChannels: () => void;
  onToggleSettings: () => void;
  onToggleProfile: () => void;
  onNavigate?: () => void;
  onCreatePost?: () => void;
}) {
  async function handleLogout() {
    await logoutUser();
    onNavigate?.();
    window.location.assign("/login");
  }
  
  return (
    <>
      <div className="mb-6 text-[38px] font-bold leading-none tracking-[0.2px]">
        Bare<span className="text-accent">Unity</span>
      </div>

      <nav className="grid gap-2 text-sm" aria-label="Sidebar menu">
       <button
          type="button"
          onClick={onCreatePost}
          className="mb-2 w-full rounded-xl border border-brand/50 bg-brand/18 px-3 py-2.75 text-left text-sm font-semibold text-text transition hover:bg-brand/26"
        >
          + Create Post
        </button>

        <MenuLink href="/" label="🏠 Home Feed" pathname={pathname} searchParams={searchParams} onNavigate={onNavigate} />

        <Dropdown
          label="⚙️ Settings"
          isActive={pathname.startsWith("/settings")}
          isOpen={settingsOpen}
          onToggle={onToggleSettings}
        >
          {settingsItems.map((item) => (
            <MenuLink key={item.href} href={item.href} label={item.label} pathname={pathname} searchParams={searchParams} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>

        <Dropdown
          label="👤 Profile"
          isActive={pathname.startsWith("/profile")}
          isOpen={profileOpen}
          onToggle={onToggleProfile}
        >
          {profileItems.map((item) => (
            <MenuLink key={item.href} href={item.href} label={item.label} pathname={pathname} searchParams={searchParams} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>

        <Dropdown
          label="📂 Channels"
          isActive={pathname.startsWith("/channels")}
          isOpen={channelsOpen}
          onToggle={onToggleChannels}
        >
          {channels.map((channel) => (
            <MenuLink key={channel.id} href={`/channels/${channel.id}`} label={channel.name} pathname={pathname} searchParams={searchParams} compact onNavigate={onNavigate} />
          ))}
        </Dropdown>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 w-full rounded-xl border border-brand-2/35 bg-brand-2/20 px-3 py-2.75 text-left text-sm font-semibold text-text transition hover:border-brand-2/50 hover:bg-brand-2/25"
        >
          ↪︎ Log out
        </button>
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
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.75 text-left transition ${
          isActive
            ? "border-accent/45 text-text"
            : "border-transparent text-muted hover:border-accent/20"
        }`}
      >
        <span>{label}</span>
        <span className="text-xs">{isOpen ? "▾" : "▸"}</span>
      </button>

      {isOpen ? <div className="ml-3 mt-1 grid gap-1 border-l border-accent/20 pl-3">{children}</div> : null}
    </div>
  );
}

function MenuLink({
  href,
  label,
  pathname,
  searchParams,
  compact = false,
  onNavigate,
}: {
  href: string;
  label: string;
  pathname: string;
  searchParams: { get: (key: string) => string | null };
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [cleanHref, queryString] = href.split("?");
  const hrefParams = new URLSearchParams(queryString ?? "");
  const hrefTab = hrefParams.get("tab");
  const currentTab = searchParams.get("tab");
  const pathnameMatches = cleanHref === "/" ? pathname === "/" : pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
  const isActive = pathnameMatches && (!hrefTab || currentTab === hrefTab);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`rounded-xl border px-3 ${compact ? "py-2 text-xs" : "py-2.75"} transition ${
        isActive
          ? "border-brand/45 bg-brand/18 text-text"
          : "border-transparent text-muted hover:border-accent/20 hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
}