"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

import styles from "./profile-link.module.css";

type SidebarProfileLinkProps = {
  className?: string;
};

function getDisplayName(user: User | null) {
  if (!user) return "Guest";
  const rawName = user.user_metadata?.username ?? user.user_metadata?.full_name ?? user.email ?? "User";
  return String(rawName).split("@")[0];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export function SidebarProfileLink({ className }: SidebarProfileLinkProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setUser(data.user ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const avatarUrl = useMemo(
    () => (user?.user_metadata?.avatar_url ? String(user.user_metadata.avatar_url) : null),
    [user],
  );
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  return (
    <Link href="/profile" className={`${styles.profileCard} ${className ?? ""}`.trim()}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={`${displayName} avatar`} className={styles.avatar} />
      ) : (
        <div className={styles.avatarFallback} aria-hidden>
          {initials}
        </div>
      )}
      <div>
        <p>{displayName}</p>
        <small>@{displayName.toLowerCase().replace(/\s+/g, "")}</small>
      </div>
    </Link>
  );
}

export function FloatingSidebarProfileLink() {
  return (
    <div className={styles.floatingWrap}>
      <SidebarProfileLink />
    </div>
  );
}