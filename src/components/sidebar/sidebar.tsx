"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Flag,
  Home,
  Image,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Waves,
  X,
} from "lucide-react";

import { logoutUser } from "@/lib/logout";
import { supabase } from "@/lib/supabase";
import { SidebarProfileLink } from "./profile-link";
import styles from "./sidebar.module.css";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

type NavItem = {
  icon: typeof Home;
  label: string;
  href?: string;
  badge?: string;
};

const primaryItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Search, label: "Search", href: "#" },
  { icon: Compass, label: "Explore", href: "/explore" },
  { icon: Image, label: "Gallery", href: "/gallery" },
  { icon: MessageCircle, label: "Messages", href: "#", badge: "4" },
] satisfies readonly NavItem[];

const bookingItems = [
  { icon: Building2, label: "Hotels & Airbnbs", href: "/bookings/hotels-airbnbs" },
  { icon: Sparkles, label: "Resorts", href: "/bookings/resorts" },
  { icon: Waves, label: "Spas", href: "/bookings/spas" },
  { icon: Compass, label: "Activities", href: "/bookings/activities" },
] satisfies readonly NavItem[];

const workspaceItems = [
  { icon: Bell, label: "Notifications", badge: "9+" },
  { icon: Users, label: "Members", href: "/members" },
  { icon: Settings, label: "Settings", href: "/settings" },
] satisfies readonly NavItem[];

const discussionRooms = [
  { name: "General Room", href: "/discussion" },
  { name: "Events Room", href: "/discussion?room=events" },
  { name: "Wellness Room", href: "/discussion?room=wellness" },
  { name: "Photography Room", href: "/discussion?room=photography" },
] as const;

const adminItems = [
  { icon: ShieldCheck, label: "Overview", href: "/admin" },
  { icon: ClipboardCheck, label: "Applications", href: "/admin/applications" },
  { icon: Flag, label: "Reports", href: "/admin/reports" },
] satisfies readonly NavItem[];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminSection = pathname?.startsWith("/admin") ?? false;
  const [isAdminOpen, setIsAdminOpen] = useState(isAdminSection);

  const onLogout = async () => {
    await logoutUser();
    router.replace("/welcome");
    router.refresh();
  };

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      const email = data.user?.email?.toLowerCase() ?? "";
      setIsAdmin(email === ADMIN_EMAIL);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email?.toLowerCase() ?? "";
      setIsAdmin(email === ADMIN_EMAIL);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);


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
              <Link key={label} href={href} className={`${styles.navItem} ${pathname === href ? styles.active : ""}`}>
                <span className={styles.itemLeft}>
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                </span>
                {badge ? <span className={styles.badge}>{badge}</span> : null}
              </Link>
            ))}

            <div className={styles.dropdown}>
              <button
                type="button"
                className={`${styles.navItem} ${styles.dropdownTrigger}`}
                onClick={() => setIsBookingsOpen((current) => !current)}
                aria-expanded={isBookingsOpen}
              >
                <span className={styles.itemLeft}>
                  <Building2 size={18} aria-hidden />
                  <span>Bookings</span>
                </span>
                <ChevronDown className={isBookingsOpen ? styles.chevronOpen : ""} size={16} aria-hidden />
              </button>

              {isBookingsOpen && (
                <div className={styles.dropdownList}>
                  {bookingItems.map(({ icon: Icon, label, href }) => (
                    <Link
                      key={label}
                      href={href}
                      className={`${styles.navItem} ${styles.dropdownItem} ${pathname === href ? styles.active : ""}`}
                    >
                      <span className={styles.itemLeft}>
                        <Icon size={16} aria-hidden />
                        <span>{label}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
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

              {isRoomsOpen && (
                <div className={styles.dropdownList}>
                  {discussionRooms.map((room) => (
                    <Link
                      key={room.name}
                      href={room.href}
                      className={`${styles.navItem} ${styles.dropdownItem} ${pathname === room.href ? styles.active : ""}`}
                    >
                      {room.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {workspaceItems.map(({ icon: Icon, label, href, badge }) => (
              <Link
                key={label}
                href={href ?? "#"}
                className={`${styles.navItem} ${href && pathname === href ? styles.active : ""}`}
              >
                <span className={styles.itemLeft}>
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                </span>
                {badge ? <span className={styles.badge}>{badge}</span> : null}
              </Link>
            ))}

            {isAdmin ? (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.dropdownTrigger}`}
                  onClick={() => setIsAdminOpen((current) => !current)}
                  aria-expanded={isAdminOpen || isAdminSection}
                >
                  <span className={styles.itemLeft}>
                    <ShieldCheck size={18} aria-hidden />
                    <span>Admin</span>
                  </span>
                  <ChevronDown className={isAdminOpen || isAdminSection ? styles.chevronOpen : ""} size={16} aria-hidden />
                </button>

                {(isAdminOpen || isAdminSection) && (
                  <div className={styles.dropdownList}>
                    {adminItems.map(({ icon: Icon, label, href }) => (
                      <Link
                        key={label}
                        href={href}
                        className={`${styles.navItem} ${styles.dropdownItem} ${pathname === href ? styles.active : ""}`}
                      >
                        <span className={styles.itemLeft}>
                          <Icon size={16} aria-hidden />
                          <span>{label}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <button type="button" className={styles.navItem} onClick={() => void onLogout()}>
              <span className={styles.itemLeft}>
                <LogOut size={18} aria-hidden />
                <span>Log out</span>
              </span>
            </button>
          </nav>
        </section>
        <SidebarProfileLink className={styles.mobileProfileCard} />
      </div>
    </aside>
  );
}