"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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

    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-full border border-sand/35 bg-card px-2 py-1 text-sand shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] transition hover:bg-card"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Toggle profile menu"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sand text-sm font-bold text-pine shadow-inner">
            {initials}
          </span>
          <span className="hidden text-sm font-semibold md:inline">{username}</span>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-sand/20 bg-card p-2 shadow-2xl backdrop-blur"
          >
            <div className="mb-2 rounded-lg bg-sand/10 px-3 py-2">
              <p className="text-sm font-semibold text-text">{username}</p>
              <p className="text-xs text-text/65">{user.email}</p>
            </div>

            <div className="space-y-1 text-sm">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-text/90 transition hover:bg-sand/15"
              >
                View profile
              </Link>
              <Link
                href="/saved"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-text/90 transition hover:bg-sand/15"
              >
                Saved posts
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