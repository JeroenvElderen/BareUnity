"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ensureProfileExists } from "@/lib/profile";
import { logoutUser } from "@/lib/logout";

function MenuIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function getInitials(user: User) {
  const source = user.user_metadata?.username || user.user_metadata?.full_name || user.email || "U";

  return (
    String(source)
      .split(/[@\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) ensureProfileExists(data.user);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) ensureProfileExists(nextUser);
      setOpen(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function logout() {
    await logoutUser();
    setOpen(false);
    window.location.assign("/login");
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
          className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-card text-text shadow-[0_10px_24px_-18px_rgb(var(--bg-deep)/0.9)] transition hover:bg-card"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Toggle profile menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={`${username} avatar`} className="h-full w-full object-cover" />
          ) : (
            <span className="inline-flex h-full w-full items-center justify-center bg-accent text-sm font-bold text-text-inverse shadow-inner">{initials}</span>
          )}
        </button>

        {open && (
          <div role="menu" className="profile-menu-card absolute right-0 top-12 z-50 w-55">
            <div className="profile-menu-user">
              <p className="truncate text-sm font-semibold text-text">{username}</p>
              <p className="truncate text-xs text-text/65">{user.email}</p>
            </div>

            <ul className="profile-menu-list">
              {[
                { href: "/", label: "Home feed" },
                { href: "/discussion", label: "Discussion" },
                { href: "/naturist-map", label: "Naturist Map" },
                { href: "/events", label: "Events" },
                { href: "/map", label: "Map" },
                { href: "/saved", label: "Saved" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="profile-menu-element">
                    <MenuIcon className="profile-menu-icon">
                      <path d="M3 10.5 12 3l9 7.5" />
                      <path d="M5 9.5V21h14V9.5" />
                    </MenuIcon>
                    <span className="profile-menu-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="profile-menu-separator" />

            <ul className="profile-menu-list">
              <li>
                <Link href="/profile" onClick={() => setOpen(false)} className="profile-menu-element">
                  <MenuIcon className="profile-menu-icon">
                    <circle cx="10" cy="8" r="5" />
                    <path d="M2 21a8 8 0 0 1 16 0" />
                  </MenuIcon>
                  <span className="profile-menu-label">View Profile</span>
                </Link>
              </li>
              <li>
                <Link href="/settings" onClick={() => setOpen(false)} className="profile-menu-element">
                  <MenuIcon className="profile-menu-icon">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </MenuIcon>
                  <span className="profile-menu-label">Settings</span>
                </Link>
              </li>
              <li>
                <button type="button" onClick={logout} className="profile-menu-element profile-menu-delete">
                  <MenuIcon className="profile-menu-icon">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </MenuIcon>
                  <span className="profile-menu-label">Log out</span>
                </button>
              </li>
            </ul>

            <div className="profile-menu-separator" />

            <ul className="profile-menu-list">
              <li>
                <Link href="/discussion" onClick={() => setOpen(false)} className="profile-menu-element profile-menu-team">
                  <MenuIcon className="profile-menu-icon">
                    <path d="M18 21a8 8 0 0 0-16 0" />
                    <circle cx="10" cy="8" r="5" />
                    <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
                  </MenuIcon>
                  <span className="profile-menu-label">Team Access</span>
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className="rounded-xl border border-accent/30 bg-accent/20 px-4 py-2 text-sm font-semibold text-text transition hover:bg-accent/35">
        Log in
      </Link>
      <Link
        href="/signup"
        className="rounded-xl border border-accent/30 bg-linear-to-r from-brand to-brand-2 px-4 py-2 text-sm font-semibold text-text transition hover:brightness-110"
      >
        Sign up
      </Link>
    </div>
  );
}