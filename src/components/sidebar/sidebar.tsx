"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
import { SidebarProfileLink } from "./profile-link";

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

const discussionRooms = [
  "General Room",
  "Events Room",
  "Wellness Room",
  "Photography Room",
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);

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

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div
        className={`${styles.menuContent} ${
          isMobileMenuOpen ? styles.menuContentOpen : ""
        }`}
      >
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Discover</p>
          <nav>
            {primaryItems.map(({ icon: Icon, label, href, badge }) => (
              <Link
                key={label}
                href={href}
                className={`${styles.navItem} ${
                  pathname === href ? styles.active : ""
                }`}
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
                <ChevronDown
                  className={isRoomsOpen ? styles.chevronOpen : ""}
                  size={16}
                  aria-hidden
                />
              </button>

              {isRoomsOpen && (
                <div className={styles.dropdownList}>
                  {discussionRooms.map((room) => (
                    <a
                      key={room}
                      href="#"
                      className={`${styles.navItem} ${styles.dropdownItem}`}
                    >
                      {room}
                    </a>
                  ))}
                </div>
              )}
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
        <SidebarProfileLink className={styles.mobileProfileCard} />
      </div>
    </aside>
  );
}