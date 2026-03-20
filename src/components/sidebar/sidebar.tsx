"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Bell,
  ChevronDown,
  Compass,
  Image,
  Home,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import styles from "./sidebar.module.css";
import { supabase } from "@/lib/supabase";

const primaryItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Search, label: "Search", href: "#" },
  { icon: Compass, label: "Explore", href: "#" },
  { icon: Image, label: "Gallery", href: "/gallery" },
  { icon: MessageCircle, label: "Messages", href: "#", badge: "4" },
] as const;

const workspaceItems = [
  { icon: Bell, label: "Notifications", badge: "9+" },
  { icon: Settings, label: "Settings" },
] as const;

const discussionRooms = ["General Room", "Events Room", "Wellness Room", "Photography Room"] as const;

function getDisplayName(user: User | null) {
  if (!user) return "Guest";
  const rawName = user.user_metadata?.username ?? user.user_metadata?.full_name ?? user.email ?? "User";
  return String(rawName).split("@")[0];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

type ProfileLinkProps = {
  avatarUrl: string | null;
  displayName: string;
  initials: string;
  className?: string;
};

function ProfileLink({ avatarUrl, displayName, initials, className }: ProfileLinkProps) {
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

export function AppSidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
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
    <aside className={styles.sidebar} aria-label="Main sidebar navigation">
      <header className={styles.header}>
        <div className={styles.logoMark} aria-hidden>
          <Sparkles size={16} />
        </div>
        <div>
          <h1>BareUnity</h1>
          <p>Connect • Share • Be free</p>
        </div>
        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
        >
          {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      <div className={`${styles.menuContent} ${isMobileMenuOpen ? styles.menuContentOpen : ""}`}>
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Discover</p>
          <nav>
            {primaryItems.map(({ icon: Icon, label, href, badge }) => (
              <Link
                key={label}
                href={href}
                className={`${styles.navItem} ${pathname === href ? styles.active : ""}`}
              >
                <span className={styles.itemLeft}>
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                </span>
                {badge ? <span className={styles.badge}>{badge}</span> : null}
              </Link>
            ))}
          </nav>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Naturist Circle</p>
          <nav>
            <div className={styles.dropdown}>
              <button
                type="button"
                className={`${styles.navItem} ${styles.dropdownTrigger}`}
                onClick={() => setIsRoomsOpen((current) => !current)}
                aria-expanded={isRoomsOpen}
              >
                <span className={styles.itemLeft}>
                  <Users size={18} aria-hidden />
                  <span>Discussion Rooms</span>
                </span>
                <ChevronDown className={isRoomsOpen ? styles.chevronOpen : ""} size={16} aria-hidden />
              </button>
              {isRoomsOpen ? (
                <div className={styles.dropdownList}>
                  {discussionRooms.map((room) => (
                    <a key={room} href="#" className={`${styles.navItem} ${styles.dropdownItem}`}>
                      {room}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {workspaceItems.map(({ icon: Icon, label, badge }) => (
              <a key={label} href="#" className={styles.navItem}>
                <span className={styles.itemLeft}>
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                </span>
                {badge ? <span className={styles.badge}>{badge}</span> : null}
              </a>
            ))}
          </nav>
        </section>

        <ProfileLink avatarUrl={avatarUrl} displayName={displayName} initials={initials} className={styles.mobileProfileCard} />
      </div>

      <footer className={styles.desktopFooter}>
        <ProfileLink avatarUrl={avatarUrl} displayName={displayName} initials={initials} />
      </footer>
    </aside>
  );
}