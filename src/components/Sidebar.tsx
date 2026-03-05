"use client";

import Link from "next/link";
import { useState } from "react";

const communities = [
  { label: "My Logo", short: "N", href: "/" },
  { label: "Travel Crew", short: "T", href: "/communities/travel" },
  { label: "City Naturists", short: "C", href: "/communities/city" },
  { label: "Events Hub", short: "E", href: "/communities/events" },
  { label: "Photography", short: "P", href: "/communities/photo" },
];

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
      <div className="mb-4 rounded-xl border border-border bg-sand/20 px-3 py-2">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">
          Homefeed
        </p>
        <p className="text-sm font-semibold text-pine">Your Communities</p>
      </div>

      <nav className="space-y-4">
        <div>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Feed
          </p>
          <div className="space-y-1">
            {feedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-text/90 transition hover:bg-pine/10 hover:text-pine"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Shortcuts
          </p>
          <div className="space-y-1">
            {shortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-text/90 transition hover:bg-pine/10 hover:text-pine"
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="fixed left-0 top-14 z-50 flex h-[calc(100vh-56px)] w-16 flex-col items-center justify-between border-r border-border bg-pine-2/95 px-2 py-3 lg:hidden">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sand/45 bg-pine text-base font-semibold text-sand shadow-soft transition hover:bg-sand hover:text-pine"
            aria-expanded={mobileOpen}
            aria-controls="mobile-homefeed-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            ☰
          </button>

          {communities.map((community, index) => (
            <Link
              key={community.label}
              href={community.href}
              className="group relative"
              title={community.label}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand/35 bg-pine text-xs font-bold text-sand transition-all duration-200 group-hover:bg-sand group-hover:text-pine">
                {index === 0 ? "⌂" : community.short}
              </span>
            </Link>
          ))}

          <button
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-sand/55 bg-pine/60 text-lg font-semibold text-sand transition hover:bg-sand hover:text-pine"
            aria-label="Add community"
          >
            +
          </button>
        </div>

        <Link
          href={communities[0].href}
          title={communities[0].label}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sand/35 bg-pine text-[10px] font-semibold text-sand"
        >
          {communities[0].short}
        </Link>
      </aside>

      <div className="w-16 shrink-0 lg:hidden" aria-hidden />

      {mobileOpen && (
        <>
          <button
            className="fixed inset-0 z-30 bg-pine-2/35 lg:hidden"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-homefeed-menu"
            className="fixed left-16 top-14 z-40 h-[calc(100vh-56px)] w-[78vw] max-w-xs overflow-y-auto border-r border-border bg-card p-4 shadow-xl lg:hidden"
          >
            <MenuContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      <aside className="hidden lg:flex lg:h-[calc(100vh-56px)] lg:sticky lg:top-14">
        <div className="w-20 border-r border-border bg-pine-2/95 px-3 py-3">
          <div className="flex flex-col items-center gap-3">
            {communities.map((community, index) => (
              <Link
                key={community.label}
                href={community.href}
                className="group relative"
                title={community.label}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sand/35 bg-pine text-sm font-bold text-sand transition-all duration-200 group-hover:rounded-xl group-hover:bg-sand group-hover:text-pine">
                  {index === 0 ? "⌂" : community.short}
                </span>
              </Link>
            ))}

            <button
              className="mt-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-sand/55 bg-pine/60 text-xl font-semibold text-sand transition hover:bg-sand hover:text-pine"
              aria-label="Add community"
            >
              +
            </button>
          </div>
        </div>

        <div className="w-72 border-r border-border bg-card/95 px-4 py-4">
          <MenuContent />
        </div>
      </aside>
    </>
  );
}
