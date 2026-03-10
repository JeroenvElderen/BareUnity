"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ensureProfileExists } from "@/lib/profile";

const mainMenuLinks = [
  { href: "/", label: "Home feed" },
  { href: "/channels", label: "Channels" },
  { href: "/events", label: "Events" },
  { href: "/map", label: "Map" },
  { href: "/saved", label: "Saved" },
];

function getInitials(user: User) {
  const source =
    user.user_metadata?.username ||
    user.user_metadata?.full_name ||
    user.email ||
    "U";

  return String(source)
    .split(/[@\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("") || "U";
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        ensureProfileExists(data.user);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        ensureProfileExists(nextUser);
      }
      setOpen(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function logout() {
    await supabase.auth.signOut();
    setOpen(false);
  }

  if (user) {
    const initials = getInitials(user);
    const username = user.user_metadata?.username || user.email?.split("@")[0] || "Naturist";
    const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-sand/35 bg-card text-sand shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] transition hover:bg-card"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Toggle profile menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={`${username} avatar`} className="h-full w-full object-cover" />
          ) : (
            <span className="inline-flex h-full w-full items-center justify-center bg-sand text-sm font-bold text-pine shadow-inner">
              {initials}
            </span>
          )}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-sand/20 bg-pine-2 p-2 shadow-2xl"
          >
            <div className="mb-2 rounded-lg bg-sand/10 px-3 py-2">
              <p className="text-sm font-semibold text-text">{username}</p>
              <p className="text-xs text-text/65">{user.email}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text/60">Main menu</p>
                <div className="space-y-1">
                  {mainMenuLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2 text-text/90 transition hover:bg-sand/15"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="border-t border-sand/15 pt-2">
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-text/90 transition hover:bg-sand/15"
                >
                  View profile
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="block w-full rounded-lg px-3 py-2 text-left text-text/90 transition hover:bg-sand/15"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="rounded-xl border border-sand/30 bg-sand/20 px-4 py-2 text-sm font-semibold text-sand transition hover:bg-sand/35"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="rounded-xl border border-sand/30 bg-gradient-to-r from-pine to-pine-2 px-4 py-2 text-sm font-semibold text-sand transition hover:brightness-110"
      >
        Sign up
      </Link>
    </div>
  );
}