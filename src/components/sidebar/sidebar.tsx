"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Settings,
  ShieldCheck,
  SunMoon,
  Sparkles,
  Users,
  Waves,
  X,
} from "lucide-react";

import { logoutUser } from "@/lib/logout";
import { applyColorMode, COLOR_MODE_STORAGE_KEY, ColorModePreference, isColorModePreference } from "@/lib/color-mode";
import { supabase } from "@/lib/supabase";
import { AppNotification, useUIStore } from "@/stores/ui-store";
import { SidebarProfileLink } from "./profile-link";
import styles from "./sidebar.module.css";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY = "bareunity_system_notification_permission_requested";

type NavItem = {
  icon: typeof Home;
  label: string;
  href?: string;
  badge?: string;
};

type NavLinkItem = NavItem & {
  href: string;
};

const primaryItems: readonly NavLinkItem[] = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Compass, label: "Explore", href: "/explore" },
  { icon: Image, label: "Gallery", href: "/gallery" },
];

const bookingItems: readonly NavLinkItem[] = [
  { icon: Building2, label: "Hotels & Airbnbs", href: "/bookings/hotels-airbnbs" },
  { icon: Sparkles, label: "Resorts", href: "/bookings/resorts" },
  { icon: Waves, label: "Spas", href: "/bookings/spas" },
  { icon: Compass, label: "Activities", href: "/bookings/activities" },
];

const workspaceItems = [
  { icon: Bell, label: "Notifications", badge: "0" },
  { icon: Users, label: "Members", href: "/members" },
  { icon: Settings, label: "Settings", href: "/settings" },
] satisfies readonly NavItem[];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(timestamp: string) {
  const diffMs = new Date(timestamp).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) return relativeTimeFormatter.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) return relativeTimeFormatter.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  return relativeTimeFormatter.format(diffDays, "day");
}

function createNotification(
  title: string,
  detail: string,
  type: AppNotification["type"],
  targetHref?: string,
): AppNotification {
  const notificationId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: notificationId,
    title,
    detail,
    type,
    unread: true,
    timestamp: new Date().toISOString(),
    targetHref,
  };
}

const discussionRooms = [
  { name: "General Room", href: "/discussion" },
  { name: "Video Room", href: "/video-room" },
  { name: "Wellness Room", href: "/discussion?room=wellness" },
  { name: "Photography Room", href: "/discussion?room=photography" },
] as const;

const adminItems: readonly NavLinkItem[] = [
  { icon: ShieldCheck, label: "Overview", href: "/admin" },
  { icon: ClipboardCheck, label: "Applications", href: "/admin/applications" },
  { icon: Flag, label: "Reports", href: "/admin/reports" },
  { icon: CircleUser, label: "Users", href: "/admin/users" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(pathname === "/discussion" || pathname === "/video-room");
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminSection = pathname?.startsWith("/admin") ?? false;
  const [isAdminOpen, setIsAdminOpen] = useState(isAdminSection);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const seenNotificationIdsRef = useRef(new Set<string>());
  const hasSeenInitialNotificationsRef = useRef(false);
  const hasRequestedSystemNotificationPermissionRef = useRef(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [generalChannelId, setGeneralChannelId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorModePreference>(() => {
    if (typeof window === "undefined") return "system";

    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isColorModePreference(stored) ? stored : "system";
  });
  const videoVisitorsRef = useRef(new Set<string>());
  const hasRealtimeFailureNoticeRef = useRef(false);
  const notifications = useUIStore((state) => state.notifications);
  const clearNotifications = useUIStore((state) => state.clearNotifications);
  const pushNotification = useUIStore((state) => state.pushNotification);
  const markNotificationAsRead = useUIStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useUIStore((state) => state.markAllNotificationsAsRead);
  const isMessagesOpen = useUIStore((state) => state.isMessagesOpen);
  const toggleMessages = useUIStore((state) => state.toggleMessages);
  const unreadNotifications = notifications.filter((notification) => notification.unread).length;
  const isUserOnlineInPlatform = useCallback(() => {
    if (typeof window === "undefined") return false;
    return navigator.onLine && document.visibilityState === "visible" && document.hasFocus();
  }, []);

  const pushLiveNotification = useCallback((notification: AppNotification) => {
    if (!isUserOnlineInPlatform()) return;
    pushNotification(notification);
  }, [isUserOnlineInPlatform, pushNotification]);

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
      setActiveToasts([]);
      setViewerId(data.user?.id ?? null);
      setIsAdmin(email === ADMIN_EMAIL);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email?.toLowerCase() ?? "";
      setActiveToasts([]);
      setViewerId(session?.user.id ?? null);
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

  useEffect(() => {
    seenNotificationIdsRef.current.clear();
    hasSeenInitialNotificationsRef.current = false;
    clearNotifications();
  }, [clearNotifications, viewerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (hasRequestedSystemNotificationPermissionRef.current) return;
    if (!viewerId) return;
    if (window.localStorage.getItem(SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY) === "true") return;

    hasRequestedSystemNotificationPermissionRef.current = true;
    window.localStorage.setItem(SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY, "true");
    void Notification.requestPermission();
  }, [viewerId]);

  useEffect(() => {
    if (!hasSeenInitialNotificationsRef.current) {
      notifications.forEach((notification) => {
        seenNotificationIdsRef.current.add(notification.id);
      });
      hasSeenInitialNotificationsRef.current = true;
      return;
    }

    const freshNotifications = notifications.filter((notification) => !seenNotificationIdsRef.current.has(notification.id));
    if (!freshNotifications.length) return;

    freshNotifications.forEach((notification) => {
      seenNotificationIdsRef.current.add(notification.id);
    });

    const unreadFreshNotifications = freshNotifications.filter((notification) => notification.unread);
    if (!unreadFreshNotifications.length) return;

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      unreadFreshNotifications.forEach((notification) => {
        const browserNotification = new Notification(notification.title, {
          body: notification.detail,
          tag: notification.id,
        });
        browserNotification.onclick = () => {
          window.focus();
          void router.push(notification.targetHref ?? "/notifications");
          browserNotification.close();
        };
      });
    }

    setActiveToasts((current) => {
      const dedupedCurrent = current.filter(
        (existingToast) => !unreadFreshNotifications.some((freshToast) => freshToast.id === existingToast.id),
      );
      return [...unreadFreshNotifications, ...dedupedCurrent].slice(0, 3);
    });

    const timers = unreadFreshNotifications.map((notification) =>
      window.setTimeout(() => {
        setActiveToasts((current) => current.filter((toast) => toast.id !== notification.id));
      }, 6500),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [notifications, router]);

  useEffect(() => {
    if (!viewerId) return;

    let isMounted = true;
    void supabase
      .from("channels")
      .select("id")
      .eq("slug", "general")
      .maybeSingle<{ id: string }>()
      .then(({ data }) => {
        if (!isMounted) return;
        setGeneralChannelId(data?.id ?? null);
      });

    return () => {
      isMounted = false;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) return;

    const reconnectRealtime = () => {
      if (typeof window === "undefined") return;
      if (!window.navigator.onLine) return;
      if (document.visibilityState === "hidden") return;
      if (supabase.realtime.isConnected() || supabase.realtime.isConnecting()) return;
      supabase.realtime.connect();
    };

    window.addEventListener("online", reconnectRealtime);
    document.addEventListener("visibilitychange", reconnectRealtime);

    return () => {
      window.removeEventListener("online", reconnectRealtime);
      document.removeEventListener("visibilitychange", reconnectRealtime);
    };
  }, [viewerId]);
  
  useEffect(() => {
    if (!viewerId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];
    let isCleaningUp = false;

    const postVotesChannel = supabase
      .channel(`notifications-post-votes-${viewerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_votes" }, ({ new: row }) => {
        const payload = row as { user_id?: string; post_id?: string };
        if (!payload.post_id || payload.user_id === viewerId) return;
        pushLiveNotification(
          createNotification(
            "New like on a post",
            "Someone liked a post in the feed.",
            "post-like",
            `/?postId=${payload.post_id}`,
          ),
        );
      });
    channels.push(postVotesChannel);

    const commentsChannel = supabase
      .channel(`notifications-comments-${viewerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, ({ new: row }) => {
        const payload = row as { author_id?: string; post_id?: string };
        if (!payload.post_id || payload.author_id === viewerId) return;
        pushLiveNotification(
          createNotification(
            "New comment",
            "A new comment was added to a feed post.",
            "post-comment",
            `/?postId=${payload.post_id}`,
          ),
        );
      });
    channels.push(commentsChannel);

    const galleryLikesChannel = supabase
      .channel(`notifications-gallery-likes-${viewerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_image_likes" }, ({ new: row }) => {
        const payload = row as { image_path?: string; user_id?: string };
        if (!payload.image_path || payload.user_id === viewerId) return;
        if (!payload.image_path.includes(`/gallery/${viewerId}/`) && !payload.image_path.includes(`gallery/${viewerId}/`)) return;
        pushLiveNotification(
          createNotification(
            "New gallery like",
            "Someone liked one of your gallery uploads.",
            "gallery-like",
            `/gallery?imagePath=${encodeURIComponent(payload.image_path)}`,
          ),
        );
      });
    channels.push(galleryLikesChannel);

    const friendRequestsChannel = supabase
      .channel(`notifications-friend-requests-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${viewerId}` },
        ({ new: row }) => {
          const payload = row as { sender_username?: string };
          pushLiveNotification(
            createNotification(
              "New friend request",
              `${payload.sender_username ?? "Someone"} sent you a friend request.`,
              "friend-request",
              "/members",
            ),
          );
        },
      );
    channels.push(friendRequestsChannel);

    const mapSpotsChannel = supabase
      .channel(`notifications-map-spots-${viewerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "naturist_map_spots" }, ({ new: row }) => {
        const payload = row as { submitted_by?: string; name?: string };
        if (payload.submitted_by === viewerId) return;
        pushLiveNotification(
          createNotification("New map entry", `${payload.name ?? "A new location"} was added to the map.`, "map-entry", "/explore"),
        );
      });
    channels.push(mapSpotsChannel);

    const videoPresenceChannel = supabase.channel(`notifications-video-presence-${viewerId}`);
    videoPresenceChannel.on("presence", { event: "sync" }, () => {
      const state = videoPresenceChannel.presenceState<{ user_id?: string; name?: string }>();
      const currentUsers = new Set<string>();
      Object.entries(state).forEach(([key, presences]) => {
        const current = presences[presences.length - 1];
        const userId = current?.user_id ?? key;
        currentUsers.add(userId);
        if (!videoVisitorsRef.current.has(userId) && userId !== viewerId) {
          pushLiveNotification(
            createNotification(
              "Video room visitor",
              `${current?.name ?? "A member"} entered the video room.`,
              "video-visitor",
              "/video-room",
            ),
          );
        }
      });
      videoVisitorsRef.current = currentUsers;
    });
    channels.push(videoPresenceChannel);

    if (generalChannelId) {
      const generalMessagesChannel = supabase
        .channel(`notifications-general-messages-${generalChannelId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "channel_messages", filter: `channel_id=eq.${generalChannelId}` },
          ({ new: row }) => {
            const payload = row as { author_id?: string };
            if (payload.author_id === viewerId) return;
            pushLiveNotification(
              createNotification(
                "New message in #general",
                "A new message was posted in General Room.",
                "general-message",
                "/discussion",
              ),
            );
          },
        );
      channels.push(generalMessagesChannel);
    }

    if (isAdmin) {
      const reportsChannel = supabase
        .channel("notifications-admin-reports")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, () => {
          pushLiveNotification(
            createNotification("New report", "A new moderation report needs review.", "admin-report", "/admin/reports"),
          );
        });
      channels.push(reportsChannel);

      const registrationsChannel = supabase
        .channel("notifications-admin-registrations")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => {
          pushLiveNotification(
            createNotification(
              "New registration",
              "A new member account has been created.",
              "admin-registration",
              "/admin/users",
            ),
          );
        });
      channels.push(registrationsChannel);
    }

    channels.forEach((channel) => {
      void channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          hasRealtimeFailureNoticeRef.current = false;
          return;
        }
        if (status === "CLOSED" && isCleaningUp) {
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          const detail = error?.message?.trim() || "Supabase Realtime channel failed to stay connected.";
          console.error("Realtime notifications channel issue", {
            status,
            channel: channel.topic,
            detail,
          });
          if (!hasRealtimeFailureNoticeRef.current) {
            hasRealtimeFailureNoticeRef.current = true;
            pushLiveNotification(
              createNotification(
                "Notifications offline",
                "Live alerts disconnected. Open DevTools for the exact realtime error.",
                "general-message",
              ),
            );
          }
        }
      });
    });

    return () => {
      isCleaningUp = true;
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [generalChannelId, isAdmin, pushLiveNotification, viewerId]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    applyColorMode(colorMode);
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);

    if (colorMode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onPreferenceChange = () => applyColorMode("system");
    mediaQuery.addEventListener("change", onPreferenceChange);
    return () => mediaQuery.removeEventListener("change", onPreferenceChange);
  }, [colorMode]);

  const nextColorModeLabel: Record<ColorModePreference, "light" | "dark"> = {
    dark: "light",
    light: "dark",
    system: "dark",
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
            <button
              type="button"
              className={`${styles.navItem} ${styles.navButton} ${isMessagesOpen ? styles.active : ""}`}
              onClick={() => {
                toggleMessages();
                setIsMobileMenuOpen(false);
              }}
            >
              <span className={styles.itemLeft}>
                <MessageCircle size={18} aria-hidden />
                <span>Messages</span>
              </span>
            </button>

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
                              onClick={() => {
                                markNotificationAsRead(notification.id);
                                if (notification.targetHref) {
                                  setIsNotificationsOpen(false);
                                  void router.push(notification.targetHref);
                                }
                              }}
                              className={`${styles.notificationItem} ${notification.unread ? styles.notificationUnread : ""}`}
                            >
                              <span>
                                <strong>{notification.title}</strong>
                                <small>{notification.detail}</small>
                              </span>
                              <em>{formatRelativeTime(notification.timestamp)}</em>
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

            <button
              type="button"
              className={`${styles.navItem} ${styles.themeToggleButton}`}
              onClick={() => setColorMode((current) => nextColorModeLabel[current])}
              aria-label={`Switch color mode to ${nextColorModeLabel[colorMode]}`}
            >
              <span className={styles.itemLeft}>
                <SunMoon size={18} aria-hidden />
                <span>Theme: {colorMode.charAt(0).toUpperCase() + colorMode.slice(1)}</span>
              </span>
            </button>
          </nav>
        </section>
        <SidebarProfileLink className={styles.mobileProfileCard} />
      </div>

      {activeToasts.length ? (
        <div className={styles.toastStack} aria-live="polite" aria-label="Notification toasts">
          {activeToasts.map((notification) => (
            <article key={notification.id} className={styles.toastCard}>
              <button
                type="button"
                className={styles.toastContentButton}
                onClick={() => {
                  markNotificationAsRead(notification.id);
                  setActiveToasts((current) => current.filter((toast) => toast.id !== notification.id));
                  void router.push("/notifications");
                }}
              >
                <strong>{notification.title}</strong>
                <p>{notification.detail}</p>
                <small>{formatRelativeTime(notification.timestamp)}</small>
              </button>
              <button
                type="button"
                className={styles.toastCloseButton}
                onClick={() => setActiveToasts((current) => current.filter((toast) => toast.id !== notification.id))}
                aria-label="Dismiss notification"
              >
                <X size={14} aria-hidden />
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
