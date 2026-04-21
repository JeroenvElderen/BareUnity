"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Flag,
  CircleUser,
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

type PopupNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
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

const initialNotifications: PopupNotification[] = [
  {
    id: "n1",
    title: "New login detected",
    detail: "Sign in from a new browser in Austin, TX.",
    time: "2m",
    unread: true,
  },
  {
    id: "n2",
    title: "You were mentioned",
    detail: "Lina mentioned you in Naturist Photography.",
    time: "15m",
    unread: true,
  },
  {
    id: "n3",
    title: "Retreat booking updated",
    detail: "Check-in changed to 4:00 PM.",
    time: "1h",
    unread: false,
  },
];

const discussionRooms = [
  { name: "General Room", href: "/discussion" },
  { name: "Video Room", href: "/video-room" },
  { name: "Wellness Room", href: "/discussion?room=wellness" },
  { name: "Photography Room", href: "/discussion?room=photography" },
] as const;

const adminItems = [
  { icon: ShieldCheck, label: "Overview", href: "/admin" },
  { icon: ClipboardCheck, label: "Applications", href: "/admin/applications" },
  { icon: Flag, label: "Reports", href: "/admin/reports" },
  { icon: CircleUser, label: "Users", href: "/admin/users" },
] satisfies readonly NavItem[];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(pathname === "/discussion" || pathname === "/video-room");
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminSection = pathname?.startsWith("/admin") ?? false;
  const [isAdminOpen, setIsAdminOpen] = useState(isAdminSection);
  const [notifications, setNotifications] = useState<PopupNotification[]>(initialNotifications);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const unreadNotifications = notifications.filter((notification) => notification.unread).length;

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

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (notificationsRef.current.contains(event.target as Node)) return;
      setIsNotificationsOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isNotificationsOpen]);

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, unread: false } : notification,
      ),
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })));
  };

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

            {workspaceItems.map(({ icon: Icon, label, href, badge }) => {
              if (label === "Notifications") {
                return (
                  <div key={label} className={styles.notificationPopoverWrap} ref={notificationsRef}>
                    <button
                      type="button"
                      className={`${styles.navItem} ${styles.dropdownTrigger}`}
                      onClick={() => setIsNotificationsOpen((current) => !current)}
                      aria-expanded={isNotificationsOpen}
                    >
                      <span className={styles.itemLeft}>
                        <Icon size={18} aria-hidden />
                        <span>{label}</span>
                      </span>
                      <span className={styles.badge}>{unreadNotifications > 0 ? unreadNotifications : badge}</span>
                    </button>

                    {isNotificationsOpen ? (
                      <div className={styles.notificationsPopup} role="dialog" aria-label="Notifications popup">
                        <div className={styles.notificationsHeader}>
                          <strong>Notifications</strong>
                          <button
                            type="button"
                            className={styles.notificationsClearButton}
                            onClick={markAllNotificationsAsRead}
                            disabled={unreadNotifications === 0}
                          >
                            Mark all read
                          </button>
                        </div>
                        <div className={styles.notificationsList}>
                          {notifications.map((notification) => (
                            <button
                              type="button"
                              key={notification.id}
                              onClick={() => markNotificationAsRead(notification.id)}
                              className={`${styles.notificationItem} ${notification.unread ? styles.notificationUnread : ""}`}
                            >
                              <span>
                                <strong>{notification.title}</strong>
                                <small>{notification.detail}</small>
                              </span>
                              <em>{notification.time}</em>
                            </button>
                          ))}
                        </div>
                        <Link href="/notifications" className={styles.notificationsFooterLink}>
                          Open full notifications page
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
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
              );
            })}

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