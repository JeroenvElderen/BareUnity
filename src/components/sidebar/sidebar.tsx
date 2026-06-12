"use client";

import NextImage from "next/image";
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
  Globe2,
  CircleUser,
  Home,
  Image,
  LogOut,
  Menu,
  Settings,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
  SunMoon,
  Users,
  X,
} from "lucide-react";

import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { logoutUser } from "@/lib/logout";
import {
  applyColorMode,
  COLOR_MODE_STORAGE_KEY,
  ColorModePreference,
  isColorModePreference,
} from "@/lib/color-mode";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import {
  isSidebarItemHidden,
  normalizeSidebarHiddenItems,
  SIDEBAR_VISIBILITY_STORAGE_EVENT,
  SIDEBAR_VISIBILITY_STORAGE_KEY,
  type SidebarHiddenItemSet,
  type SidebarNavItem,
  type SidebarNavLinkItem,
} from "@/lib/sidebar-visibility";
import { supabase } from "@/lib/supabase";
import { AppNotification, useUIStore } from "@/stores/ui-store";
import { SidebarProfileLink } from "./profile-link";
import styles from "./sidebar.module.css";

const SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY =
  "bareunity_system_notification_permission_requested";
const NOTIFICATION_POLL_INTERVAL_MS = 120_000;
const NOTIFICATION_READ_STORAGE_PREFIX = "bareunity_read_notification_ids";

type CountryNavItem = {
  slug: string;
  name: string;
  flag?: string | null;
};

const fallbackCountryNavItems: readonly CountryNavItem[] = [
  { slug: "spain", name: "Spain", flag: "🇪🇸" },
];

const primaryItems: readonly SidebarNavLinkItem[] = [
  { id: "home", icon: Home, label: "Home", href: "/" },
  { id: "explore", icon: Compass, label: "Explore", href: "/explore" },
  { id: "gallery", icon: Image, label: "Gallery", href: "/gallery" },
];

const bookingItems: readonly SidebarNavLinkItem[] = [
  { id: "booking-stays", icon: Building2, label: "Stays", href: "/bookings/hotels-airbnbs" },
  { id: "booking-activities", icon: Compass, label: "Activities", href: "/bookings/activities" },
];

const workspaceItems = [
  { id: "notifications", icon: Bell, label: "Notifications", href: "/notifications", badge: "0" },
  { id: "members", icon: Users, label: "Members", href: "/members" },
  { id: "settings", icon: Settings, label: "Settings", href: "/settings" },
  { id: "policies", icon: ScrollText, label: "Policies", href: "/policies" },
] satisfies readonly SidebarNavItem[];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelativeTime(timestamp: string) {
  const diffMs = new Date(timestamp).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60)
    return relativeTimeFormatter.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48)
    return relativeTimeFormatter.format(diffHours, "hour");

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
] as const;

type VerificationApplySnapshot = {
  eligible?: boolean;
  status?: string;
};

const adminItems: readonly SidebarNavLinkItem[] = [
  { id: "admin-overview", icon: ShieldCheck, label: "Overview", href: "/admin" },
  { id: "admin-applications", icon: ClipboardCheck, label: "Applications", href: "/admin/applications" },
  { id: "admin-reports", icon: Flag, label: "Reports", href: "/admin/reports" },
  { id: "admin-users", icon: CircleUser, label: "Users", href: "/admin/users" },
  { id: "admin-stays", icon: Building2, label: "Stays", href: "/admin/stays" },
];

function isActiveNavItem(pathname: string | null, href: string) {
  return pathname === href;
}

function sanitizeCountryNavItems(items: CountryNavItem[]) {
  const seenSlugs = new Set<string>();

  return items
    .map((item) => ({
      slug: item.slug.trim().toLowerCase(),
      name: item.name.trim(),
      flag: item.flag?.trim() || null,
    }))
    .filter((item) => {
      if (!item.slug || !item.name || seenSlugs.has(item.slug)) return false;
      seenSlugs.add(item.slug);
      return true;
    })
    .sort((firstCountry, secondCountry) =>
      firstCountry.name.localeCompare(secondCountry.name, "en", {
        sensitivity: "base",
      }),
    );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(
    pathname === "/discussion" || pathname === "/video-room",
  );
  const isCountriesSection = pathname?.startsWith("/countries") ?? false;
  const [isCountriesOpen, setIsCountriesOpen] = useState(isCountriesSection);
  const [countryNavItems, setCountryNavItems] = useState<CountryNavItem[]>(
    () => [...fallbackCountryNavItems],
  );
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminSection = pathname?.startsWith("/admin") ?? false;
  const [isAdminOpen, setIsAdminOpen] = useState(isAdminSection);
  const [hiddenSidebarItems, setHiddenSidebarItems] =
    useState<SidebarHiddenItemSet>({});
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);
  const seenNotificationIdsRef = useRef(new Set<string>());
  const hasSeenInitialNotificationsRef = useRef(false);
  const hasRequestedSystemNotificationPermissionRef = useRef(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [canApplyForVerification, setCanApplyForVerification] = useState(false);
  const [generalChannelId, setGeneralChannelId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorModePreference>(() => {
    if (typeof window === "undefined") return "system";

    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isColorModePreference(stored) ? stored : "system";
  });
  const videoVisitorsRef = useRef(new Set<string>());
  const notifications = useUIStore((state) => state.notifications);
  const clearNotifications = useUIStore((state) => state.clearNotifications);
  const setNotifications = useUIStore((state) => state.setNotifications);
  const setNotificationReadStorageKey = useUIStore(
    (state) => state.setNotificationReadStorageKey,
  );
  const pushNotification = useUIStore((state) => state.pushNotification);
  const markNotificationAsRead = useUIStore(
    (state) => state.markNotificationAsRead,
  );
  const unreadNotifications = notifications.filter(
    (notification) => notification.unread,
  ).length;
  const requestSystemNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    hasRequestedSystemNotificationPermissionRef.current = true;
    const permission = await Notification.requestPermission();
    if (permission === "default") {
      hasRequestedSystemNotificationPermissionRef.current = false;
      return;
    }

    window.localStorage.setItem(
      SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY,
      "true",
    );
  }, []);

  const pushLiveNotification = useCallback(
    (notification: AppNotification) => {
      if (typeof window !== "undefined" && !window.navigator.onLine) return;
      pushNotification(notification);
    },
    [pushNotification],
  );


  useEffect(() => {
    let isMounted = true;

    const applyHiddenItems = (hiddenItems: unknown) => {
      if (isMounted) {
        setHiddenSidebarItems(normalizeSidebarHiddenItems(hiddenItems));
      }
    };

    try {
      const cached = window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
      if (cached) applyHiddenItems(JSON.parse(cached));
    } catch (error) {
      console.debug("Could not read cached sidebar visibility settings", error);
    }

    const loadHiddenItems = async () => {
      try {
        const response = await fetch("/api/sidebar-visibility", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = (await response.json()) as { hiddenItems?: unknown };
        applyHiddenItems(payload.hiddenItems);
        window.localStorage.setItem(
          SIDEBAR_VISIBILITY_STORAGE_KEY,
          JSON.stringify(payload.hiddenItems ?? []),
        );
      } catch (error) {
        console.debug("Could not load sidebar visibility settings", error);
      }
    };

    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== SIDEBAR_VISIBILITY_STORAGE_KEY) return;
      try {
        applyHiddenItems(event.newValue ? JSON.parse(event.newValue) : []);
      } catch (error) {
        console.debug("Could not parse sidebar visibility settings", error);
      }
    };

    const onVisibilityChange = () => {
      try {
        const cached = window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
        applyHiddenItems(cached ? JSON.parse(cached) : []);
      } catch (error) {
        console.debug("Could not sync sidebar visibility settings", error);
      }
    };

    void loadHiddenItems();
    window.addEventListener("storage", onStorageChange);
    window.addEventListener(SIDEBAR_VISIBILITY_STORAGE_EVENT, onVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener(SIDEBAR_VISIBILITY_STORAGE_EVENT, onVisibilityChange);
    };
  }, []);

  const onLogout = async () => {
    await logoutUser();
    router.replace("/welcome");
    router.refresh();
  };

  useEffect(() => {
    let isMounted = true;

    const loadCountryNavItems = async () => {
      try {
        const { data, error } = await supabase
          .from("country_discovery_profiles")
          .select("slug, name, flag")
          .order("name", { ascending: true });

        if (error) throw error;

        const countries = sanitizeCountryNavItems(
          ((data ?? []) as CountryNavItem[]).map((country) => ({
            slug: country.slug,
            name: country.name,
            flag: country.flag,
          })),
        );

        if (isMounted && countries.length > 0) {
          setCountryNavItems(countries);
        }
      } catch (error) {
        console.debug("Could not load country navigation items", error);
      }
    };

    void loadCountryNavItems();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isCountriesSection) setIsCountriesOpen(true);
  }, [isCountriesSection]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      const email = data.user?.email?.toLowerCase() ?? "";
      setActiveToasts([]);
      setViewerId(data.user?.id ?? null);
      setCanApplyForVerification(false);
      setIsAdmin(isPlatformAdminEmail(email));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email?.toLowerCase() ?? "";
      setActiveToasts([]);
      setViewerId(session?.user.id ?? null);
      setCanApplyForVerification(false);
      setIsAdmin(isPlatformAdminEmail(email));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    seenNotificationIdsRef.current.clear();
    hasSeenInitialNotificationsRef.current = false;
    setNotificationReadStorageKey(
      viewerId ? `${NOTIFICATION_READ_STORAGE_PREFIX}:${viewerId}` : null,
    );
    clearNotifications();
  }, [clearNotifications, setNotificationReadStorageKey, viewerId]);

  useEffect(() => {
    if (!viewerId) return;

    let isMounted = true;

    const loadVerificationEligibility = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          if (isMounted) setCanApplyForVerification(false);
          return;
        }

        const response = await fetch("/api/verification/apply", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (isMounted) setCanApplyForVerification(false);
          return;
        }

        const payload = (await response.json()) as VerificationApplySnapshot;
        if (isMounted) setCanApplyForVerification(payload.eligible === true);
      } catch (error) {
        console.debug("Could not load verification eligibility", error);
        if (isMounted) setCanApplyForVerification(false);
      }
    };

    void loadVerificationEligibility();

    return () => {
      isMounted = false;
    };
  }, [viewerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (hasRequestedSystemNotificationPermissionRef.current) return;
    if (!viewerId) return;
    if (
      window.localStorage.getItem(
        SYSTEM_NOTIFICATION_PERMISSION_REQUESTED_KEY,
      ) === "true"
    )
      return;

    void requestSystemNotificationPermission();
  }, [requestSystemNotificationPermission, viewerId]);

  useEffect(() => {
    if (!viewerId) return;

    let isMounted = true;
    let isInitialFetch = true;

    const loadNotifications = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) return;

        const response = await fetch("/api/notifications", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) return;

        const payload = (await response.json()) as {
          notifications?: AppNotification[];
        };
        if (!isMounted || !Array.isArray(payload.notifications)) return;

        if (isInitialFetch) {
          payload.notifications.forEach((notification) => {
            seenNotificationIdsRef.current.add(notification.id);
          });
          hasSeenInitialNotificationsRef.current = true;
          isInitialFetch = false;
        }

        setNotifications(payload.notifications);
      } catch (error) {
        console.debug("Could not load notifications", error);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    };

    void loadNotifications();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(
      () => void loadNotifications(),
      NOTIFICATION_POLL_INTERVAL_MS,
    );

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [setNotifications, viewerId]);

  useEffect(() => {
    if (!hasSeenInitialNotificationsRef.current) {
      notifications.forEach((notification) => {
        seenNotificationIdsRef.current.add(notification.id);
      });
      hasSeenInitialNotificationsRef.current = true;
      return;
    }

    const freshNotifications = notifications.filter(
      (notification) => !seenNotificationIdsRef.current.has(notification.id),
    );
    if (!freshNotifications.length) return;

    freshNotifications.forEach((notification) => {
      seenNotificationIdsRef.current.add(notification.id);
    });

    const unreadFreshNotifications = freshNotifications.filter(
      (notification) => notification.unread,
    );
    if (!unreadFreshNotifications.length) return;

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
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
        (existingToast) =>
          !unreadFreshNotifications.some(
            (freshToast) => freshToast.id === existingToast.id,
          ),
      );
      return [...unreadFreshNotifications, ...dedupedCurrent].slice(0, 3);
    });

    const timers = unreadFreshNotifications.map((notification) =>
      window.setTimeout(() => {
        setActiveToasts((current) =>
          current.filter((toast) => toast.id !== notification.id),
        );
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
      if (supabase.realtime.isConnected() || supabase.realtime.isConnecting())
        return;
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_votes" },
        ({ new: row }) => {
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
        },
      );
    channels.push(postVotesChannel);

    const commentsChannel = supabase
      .channel(`notifications-comments-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        ({ new: row }) => {
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
        },
      );
    channels.push(commentsChannel);

    const galleryLikesChannel = supabase
      .channel(`notifications-gallery-likes-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gallery_image_likes" },
        ({ new: row }) => {
          const payload = row as { image_path?: string; user_id?: string };
          if (!payload.image_path || payload.user_id === viewerId) return;
          if (
            !payload.image_path.includes(`/gallery/${viewerId}/`) &&
            !payload.image_path.includes(`gallery/${viewerId}/`)
          )
            return;
          pushLiveNotification(
            createNotification(
              "New gallery like",
              "Someone liked one of your gallery uploads.",
              "gallery-like",
              `/gallery?imagePath=${encodeURIComponent(payload.image_path)}`,
            ),
          );
        },
      );
    channels.push(galleryLikesChannel);

    const mapSpotsChannel = supabase
      .channel(`notifications-map-spots-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "naturist_map_spots" },
        ({ new: row }) => {
          const payload = row as { submitted_by?: string; name?: string };
          if (payload.submitted_by === viewerId) return;
          pushLiveNotification(
            createNotification(
              "New map entry",
              `${payload.name ?? "A new location"} was added to the map.`,
              "map-entry",
              "/explore",
            ),
          );
        },
      );
    channels.push(mapSpotsChannel);

    const videoPresenceChannel = supabase.channel(
      `notifications-video-presence-${viewerId}`,
    );
    videoPresenceChannel.on("presence", { event: "sync" }, () => {
      const state = videoPresenceChannel.presenceState<{
        user_id?: string;
        name?: string;
      }>();
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
          {
            event: "INSERT",
            schema: "public",
            table: "channel_messages",
            filter: `channel_id=eq.${generalChannelId}`,
          },
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
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reports" },
          () => {
            pushLiveNotification(
              createNotification(
                "New report",
                "A new moderation report needs review.",
                "admin-report",
                "/admin/reports",
              ),
            );
          },
        );
      channels.push(reportsChannel);

      const registrationsChannel = supabase
        .channel("notifications-admin-registrations")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "profiles" },
          () => {
            pushLiveNotification(
              createNotification(
                "New registration",
                "A new member account has been created.",
                "admin-registration",
                "/admin/users",
              ),
            );
          },
        );
      channels.push(registrationsChannel);

      const feedbackChannel = supabase
        .channel("notifications-admin-feedback")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "feedback_messages" },
          ({ new: row }) => {
            const payload = row as { message?: string };
            const isLocationRequest =
              payload.message?.startsWith(LOCATION_REQUEST_PREFIX) ?? false;
            pushLiveNotification(
              createNotification(
                isLocationRequest ? "New location request" : "New feedback",
                isLocationRequest
                  ? "A member submitted a location request."
                  : "A member sent new feedback.",
                isLocationRequest ? "admin-location" : "admin-feedback",
                isLocationRequest ? "/admin/locations" : "/admin/feedback",
              ),
            );
          },
        );
      channels.push(feedbackChannel);

      const verificationChannel = supabase
        .channel("notifications-admin-verifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "verification_submissions",
          },
          () => {
            pushLiveNotification(
              createNotification(
                "New verification request",
                "A member is waiting for verification review.",
                "admin-verification",
                "/admin/applications",
              ),
            );
          },
        );
      channels.push(verificationChannel);
    }

    channels.forEach((channel) => {
      void channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") return;
        if (status === "CLOSED" && isCleaningUp) {
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          const detail =
            error?.message?.trim() ||
            "Supabase Realtime channel failed to stay connected.";
          console.debug("Realtime notifications channel issue", {
            status,
            channel: channel.topic,
            detail,
          });
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
    if (typeof document === "undefined" || typeof window === "undefined")
      return;

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


  const visiblePrimaryItems = primaryItems.filter(
    (item) => !isSidebarItemHidden(hiddenSidebarItems, item.id),
  );
  const visibleBookingItems = bookingItems.filter(
    (item) => !isSidebarItemHidden(hiddenSidebarItems, item.id),
  );
  const visibleWorkspaceItems = workspaceItems.filter(
    (item) => !isSidebarItemHidden(hiddenSidebarItems, item.id),
  );
  const visibleDiscussionRooms = discussionRooms.filter((room) => {
    if (room.href === "/discussion") {
      return !isSidebarItemHidden(hiddenSidebarItems, "general-room");
    }
    if (room.href === "/video-room") {
      return !isSidebarItemHidden(hiddenSidebarItems, "video-room");
    }
    return true;
  });
  const visibleAdminItems = adminItems.filter(
    (item) => !isSidebarItemHidden(hiddenSidebarItems, item.id),
  );
  const showCountries = !isSidebarItemHidden(hiddenSidebarItems, "countries");
  const showBookings =
    !isSidebarItemHidden(hiddenSidebarItems, "bookings") &&
    visibleBookingItems.length > 0;
  const showDiscussionRooms =
    !isSidebarItemHidden(hiddenSidebarItems, "discussion-rooms") &&
    visibleDiscussionRooms.length > 0;
  const showVerificationCta =
    canApplyForVerification &&
    !isSidebarItemHidden(hiddenSidebarItems, "verification");
  const showAdminMenu =
    isAdmin &&
    !isSidebarItemHidden(hiddenSidebarItems, "admin") &&
    visibleAdminItems.length > 0;

  return (
    <>
      <div className={styles.sidebarRail} aria-hidden />
      <aside className={styles.sidebar} aria-label="Main sidebar navigation">
        <header className={styles.header}>
          <div className={styles.logoMark} aria-hidden>
            <NextImage
              src="/logo.png"
              alt=""
              width={1254}
              height={1254}
              className={styles.logoImage}
              priority
            />
          </div>
          <div>
            <h1>BareUnity</h1>
            <p>Connect • Share • Be free</p>
          </div>
          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label={
              isMobileMenuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>

        <div
          className={`${styles.menuContent} ${isMobileMenuOpen ? styles.menuContentOpen : ""}`}
        >
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Discover</p>
            <nav>
              {visiblePrimaryItems.map(({ icon: Icon, label, href, badge }) => (
                <Link
                  key={label}
                  href={href}
                  className={`${styles.navItem} ${isActiveNavItem(pathname, href) ? styles.active : ""}`}
                >
                  <span className={styles.itemLeft}>
                    <Icon size={18} aria-hidden />
                    <span>{label}</span>
                  </span>
                  {badge ? <span className={styles.badge}>{badge}</span> : null}
                </Link>
              ))}
              {showCountries ? (
                <div className={styles.dropdown}>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.dropdownTrigger} ${isCountriesSection ? styles.active : ""}`}
                  onClick={() => setIsCountriesOpen((current) => !current)}
                  aria-expanded={isCountriesOpen || isCountriesSection}
                >
                  <span className={styles.itemLeft}>
                    <Globe2 size={18} aria-hidden />
                    <span>Countries</span>
                  </span>
                  <ChevronDown
                    className={
                      isCountriesOpen || isCountriesSection
                        ? styles.chevronOpen
                        : ""
                    }
                    size={16}
                    aria-hidden
                  />
                </button>

                {(isCountriesOpen || isCountriesSection) && (
                  <div className={styles.dropdownList}>
                    <Link
                      href="/countries"
                      className={`${styles.navItem} ${styles.dropdownItem} ${pathname === "/countries" ? styles.active : ""}`}
                    >
                      All countries
                    </Link>
                    {countryNavItems.map((country) => {
                      const href = `/countries/${country.slug}`;

                      return (
                        <Link
                          key={country.slug}
                          href={href}
                          className={`${styles.navItem} ${styles.dropdownItem} ${pathname === href ? styles.active : ""}`}
                        >
                          <span className={styles.countryNavLabel}>
                            {country.flag ? (
                              <span aria-hidden>{country.flag}</span>
                            ) : null}
                            <span>{country.name}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
                </div>
              ) : null}
              {showBookings ? (
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
                  <ChevronDown
                    className={isBookingsOpen ? styles.chevronOpen : ""}
                    size={16}
                    aria-hidden
                  />
                </button>

                {isBookingsOpen && (
                  <div className={styles.dropdownList}>
                    {visibleBookingItems.map(({ icon: Icon, label, href }) => (
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
            </nav>
          </section>

          <section className={styles.section}>
            <p className={styles.sectionLabel}>Naturist Circle</p>
            <nav>
              {showDiscussionRooms ? (
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
                    {visibleDiscussionRooms.map((room) => (
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
              ) : null}

              {visibleWorkspaceItems.map(({ icon: Icon, label, href, badge }) => {
                const isNotificationsItem = label === "Notifications";
                const itemBadge =
                  isNotificationsItem && unreadNotifications > 0
                    ? String(unreadNotifications)
                    : badge;

                return (
                  <Link
                    key={label}
                    href={href ?? "#"}
                    className={`${styles.navItem} ${href && pathname === href ? styles.active : ""}`}
                    onClick={
                      isNotificationsItem
                        ? () => void requestSystemNotificationPermission()
                        : undefined
                    }
                  >
                    <span className={styles.itemLeft}>
                      <Icon size={18} aria-hidden />
                      <span>{label}</span>
                    </span>
                    {itemBadge ? (
                      <span className={styles.badge}>{itemBadge}</span>
                    ) : null}
                  </Link>
                );
              })}

              {showVerificationCta ? (
                <Link
                  href="/settings#verification"
                  className={`${styles.navItem} ${styles.verificationCta}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className={styles.itemLeft}>
                    <ShieldPlus size={18} aria-hidden />
                    <span>Get verified</span>
                  </span>
                  <span className={styles.verificationCtaBadge}>ID</span>
                </Link>
              ) : null}

              {showAdminMenu ? (
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
                    <ChevronDown
                      className={
                        isAdminOpen || isAdminSection ? styles.chevronOpen : ""
                      }
                      size={16}
                      aria-hidden
                    />
                  </button>

                  {(isAdminOpen || isAdminSection) && (
                    <div className={styles.dropdownList}>
                      {visibleAdminItems.map(({ icon: Icon, label, href }) => (
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

              <button
                type="button"
                className={styles.navItem}
                onClick={() => void onLogout()}
              >
                <span className={styles.itemLeft}>
                  <LogOut size={18} aria-hidden />
                  <span>Log out</span>
                </span>
              </button>

              <button
                type="button"
                className={`${styles.navItem} ${styles.themeToggleButton}`}
                onClick={() =>
                  setColorMode((current) => nextColorModeLabel[current])
                }
                aria-label={`Switch color mode to ${nextColorModeLabel[colorMode]}`}
              >
                <span className={styles.itemLeft}>
                  <SunMoon size={18} aria-hidden />
                  <span>
                    Theme:{" "}
                    {colorMode.charAt(0).toUpperCase() + colorMode.slice(1)}
                  </span>
                </span>
              </button>
            </nav>
          </section>
          <SidebarProfileLink className={styles.mobileProfileCard} />
        </div>

        {activeToasts.length ? (
          <div
            className={styles.toastStack}
            aria-live="polite"
            aria-label="Notification toasts"
          >
            {activeToasts.map((notification) => (
              <article key={notification.id} className={styles.toastCard}>
                <button
                  type="button"
                  className={styles.toastContentButton}
                  onClick={() => {
                    markNotificationAsRead(notification.id);
                    setActiveToasts((current) =>
                      current.filter((toast) => toast.id !== notification.id),
                    );
                    void router.push(
                      notification.targetHref ?? "/notifications",
                    );
                  }}
                >
                  <strong>{notification.title}</strong>
                  <p>{notification.detail}</p>
                  <small>{formatRelativeTime(notification.timestamp)}</small>
                </button>
                <button
                  type="button"
                  className={styles.toastCloseButton}
                  onClick={() =>
                    setActiveToasts((current) =>
                      current.filter((toast) => toast.id !== notification.id),
                    )
                  }
                  aria-label="Dismiss notification"
                >
                  <X size={14} aria-hidden />
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}
