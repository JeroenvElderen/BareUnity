"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/discussion", label: "Discussion" },
  { href: "/naturist-map", label: "Naturist Map" },
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
                ? "border-accent/90 bg-accent/92 text-[rgb(var(--accent-contrast))]"
                : "border-accent/45 bg-accent/16 text-accent hover:border-accent/72 hover:bg-accent/26"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}