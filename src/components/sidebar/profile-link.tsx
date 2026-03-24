"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

import styles from "./profile-link.module.css";

type SidebarProfileLinkProps = {
  className?: string;
};

function getDisplayName(user: User | null, profileUsername: string | null) {
  if (profileUsername) return profileUsername;
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
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfileUsername = async (activeUser: User | null) => {
      if (!activeUser) {
        if (isMounted) setProfileUsername(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", activeUser.id)
        .maybeSingle();

      if (isMounted) {
        setProfileUsername(data?.username ? String(data.username) : null);
      }
    };

    void supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      if (isMounted) {
        setUser(currentUser);
      }
      void loadProfileUsername(currentUser);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      void loadProfileUsername(sessionUser);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => getDisplayName(user, profileUsername), [user, profileUsername]);
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
      <div className={styles.textWrap}>
        <p>{displayName}</p>
        <small>@{displayName.toLowerCase().replace(/\s+/g, "")}</small>
      </div>
    </Link>
  );
}