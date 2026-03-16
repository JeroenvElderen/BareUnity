"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/channels", label: "Channels" },
];

export default function AppMenu() {
  const pathname = usePathname();

  return (
    <nav aria-label="Global menu" className="flex flex-wrap items-center gap-2">
      {menuItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              isActive
                ? "border-accent/70 bg-accent/52 text-[rgb(var(--accent-contrast))]"
                : "border-accent/30 bg-accent/10 text-muted hover:border-accent/45 hover:bg-accent/20 hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}