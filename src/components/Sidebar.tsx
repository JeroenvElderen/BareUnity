"use client";

import Link from "next/link";

const nav = [
  { href: "/", label: "Home" },
  { href: "/communities", label: "Communities" },
  { href: "/events", label: "Events" },
  { href: "/map", label: "Map" },
  { href: "/saved", label: "Saved" },
];

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-border">
        <div className="font-bold tracking-tight">Naturist</div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-2">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-text/90 hover:bg-black/5"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-pine/70" />
            {item.label}
          </Link>
        ))}

        <div className="pt-4 mt-4 border-t border-border">
          <div className="px-3 text-xs text-muted uppercase tracking-wide mb-2">
            Resources
          </div>
          <Link href="/guidelines" className="block rounded-xl px-3 py-2 text-sm hover:bg-black/5">
            Community Guidelines
          </Link>
          <Link href="/help" className="block rounded-xl px-3 py-2 text-sm hover:bg-black/5">
            Help
          </Link>
        </div>
      </div>
    </aside>
  );
}