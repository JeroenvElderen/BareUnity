"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Community, getInitials, readStoredCommunities } from "@/lib/community-data";

const feedLinks = [
  { href: "/", label: "Home Feed" },
  { href: "/popular", label: "Popular" },
  { href: "/latest", label: "Latest" },
  { href: "/messages", label: "Messages" },
];

const shortcuts = [
  { href: "/communities", label: "Communities" },
  { href: "/events", label: "Events" },
  { href: "/map", label: "Map" },
  { href: "/saved", label: "Saved" },
];

function MenuContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-4 rounded-xl border border-sand/20 bg-sand/10 px-3 py-2 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Homefeed</p>
        <p className="text-sm font-semibold text-sand">Your Spaces</p>
      </div>

      <nav className="space-y-4">
        <div>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Feed</p>
          <div className="space-y-1">
            {feedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-text/90 transition hover:bg-sand/20 hover:text-sand hover:translate-x-0.5"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Shortcuts</p>
          <div className="space-y-1">
            {shortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-text/90 transition hover:bg-sand/20 hover:text-sand hover:translate-x-0.5"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return !window.location.pathname.startsWith("/communities/");
  });
  const [communities, setCommunities] = useState<Community[]>(() => readStoredCommunities());

  useEffect(() => {
    function refresh() {
      setCommunities(readStoredCommunities());
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
      <aside className="fixed left-0 top-16 z-50 flex h-[calc(100vh-64px)] w-16 flex-col items-center justify-between border-r border-sand/20 bg-pine-2/90 px-2 py-3 backdrop-blur">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sand/45 bg-pine text-base font-semibold text-sand shadow-soft transition hover:bg-sand hover:text-pine"
            aria-expanded={menuOpen}
            aria-controls="sidebar-menu-panel"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            ☰
          </button>

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

          <Link
            href="/communities?create=1"
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-sand/55 bg-pine/60 text-lg font-semibold text-sand transition hover:bg-sand hover:text-pine"
            aria-label="Add community"
          >
            +
          </Link>
        </div>

        <div className="h-8 w-8" aria-hidden />
      </aside>

      <div className="w-16 shrink-0" aria-hidden />

      {menuOpen && (
        <>
          <button
            className="fixed inset-0 z-30 bg-pine-2/80 lg:hidden"
            aria-label="Close menu overlay"
            onClick={() => setMenuOpen(false)}
          />

          <aside
            id="sidebar-menu-panel"
            className="fixed left-16 top-16 z-40 h-[calc(100vh-64px)] w-[78vw] max-w-xs overflow-y-auto border-r border-sand/20 bg-card/90 p-4 shadow-xl backdrop-blur lg:w-72"
          >
            <MenuContent onNavigate={() => setMenuOpen(false)} />
          </aside>

          <div className="hidden w-72 shrink-0 lg:block" aria-hidden />
        </>
      )}
    </>
  );
}
