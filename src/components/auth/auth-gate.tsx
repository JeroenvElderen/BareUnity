"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildUserScopedCacheKey,
  evictCachedValuesByPrefix,
  setActiveCacheUser,
  writeCachedValue,
} from "@/lib/client-cache";
import { applyColorMode, COLOR_MODE_STORAGE_KEY, ColorModePreference, isColorModePreference } from "@/lib/color-mode";
import type { HomeFeedPayload } from "@/lib/homefeed";
import { setPrefetchedRouteData } from "@/lib/prefetched-route-data";
import { emitSocialGraphUpdatedEvent } from "@/lib/social-graph-events";
import { supabase } from "@/lib/supabase";
import { normalizeUsername } from "@/lib/username";

import styles from "./auth-gate.module.css";

type AuthGateProps = {
  children: ReactNode;
};

type GallerySnapshotPayload = {
  items?: Array<{ src?: unknown }>;
};

type MemberDirectoryPayload = {
  members?: Array<{ username?: unknown }>;
};

type ProfileSnapshotPayload = {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    location: string | null;
  } | null;
  posts: Array<{
    id: string;
    title: string | null;
    content: string | null;
    media_url: string | null;
    created_at: string | null;
    post_type: string | null;
  }>;
  interests: string[];
  stats: { posts: number; friends: number; comments: number };
};

type ProfilePageCachePayload = ProfileSnapshotPayload & {
  friends: Array<{ id: string; username: string }>;
};

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register"]);
const PROFILE_CACHE_KEY_PREFIX = "profile:";
const LIVE_TABLES = ["posts", "comments", "friendships", "profiles", "profile_settings", "map_spots"] as const;
const POST_LOGIN_LOADER_FLAG = "bareunity_post_login_loading";
const CRITICAL_ROUTES_TO_PREFETCH = [
  "/",
];
const BACKGROUND_ROUTES_TO_PREFETCH = [
  "/members",
  "/explore",
  "/profile",
  "/gallery",
  "/settings",
  "/bookings",
  "/bookings/activities",
  "/bookings/hotels-airbnbs",
  "/bookings/resorts",
  "/bookings/spas",
  "/admin",
  "/admin/applications",
  "/admin/reports",
];
const PRE_LOGIN_DATA_ENDPOINTS = [
  "/api/homefeed",
];
const POST_LOGIN_BACKGROUND_ENDPOINTS = [
  "/api/map-spots",
  "/api/gallery/snapshot",
  "/api/members",
  "/api/profile/snapshot",
];
const POST_LOGIN_HOMEFEED_ENDPOINT = "/api/homefeed";
const POST_LOGIN_MAP_SPOTS_ENDPOINT = "/api/map-spots";
const POST_LOGIN_GALLERY_ENDPOINT = "/api/gallery/snapshot";
const POST_LOGIN_MEMBERS_ENDPOINT = "/api/members";
const POST_LOGIN_PROFILE_ENDPOINT = "/api/profile/snapshot";
const WARMUP_MIN_INTERVAL_MS = 5 * 60_000;

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isHydratingApp, setIsHydratingApp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(POST_LOGIN_LOADER_FLAG) === "true";
  });
  const [authInitError, setAuthInitError] = useState(false);
  const [hasSelectedColorMode, setHasSelectedColorMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return isColorModePreference(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY));
  });
  const hasConsumedPostLoginLoaderRef = useRef(false);
  const lastWarmupAtRef = useRef(0);
  const warmupInFlightRef = useRef(false);
  const hasPrefetchedBeforeLoginRef = useRef(false);
  const prefetchedGalleryImageUrlsRef = useRef<Set<string>>(new Set());

  const prefetchGalleryImages = useCallback((payload: GallerySnapshotPayload) => {
    if (typeof window === "undefined") return;

    const urls = (payload.items ?? [])
      .map((item) => (typeof item?.src === "string" ? item.src.trim() : ""))
      .filter(Boolean);

    urls.forEach((src) => {
      if (prefetchedGalleryImageUrlsRef.current.has(src)) return;
      prefetchedGalleryImageUrlsRef.current.add(src);

      const image = new window.Image();
      image.decoding = "async";
      image.loading = "eager";
      image.src = src;
    });
  }, []);

  const isPublicPath = useMemo(() => {
    if (!pathname) return false;
    if (PUBLIC_PATHS.has(pathname)) return true;
    return pathname.startsWith("/api") || pathname.startsWith("/_next");
  }, [pathname]);

  const consumePostLoginLoaderFlag = useCallback(() => {
    if (hasConsumedPostLoginLoaderRef.current) return false;
    const shouldHydrate = window.sessionStorage.getItem(POST_LOGIN_LOADER_FLAG) === "true";
    if (shouldHydrate) {
      hasConsumedPostLoginLoaderRef.current = true;
      window.sessionStorage.removeItem(POST_LOGIN_LOADER_FLAG);
    }
    return shouldHydrate;
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async () => {
      let sessionUserId: string | null = null;
      let authed = false;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        authed = Boolean(session?.user);
        sessionUserId = session?.user?.id ?? null;
      } catch (error) {
        console.error("Failed to initialize auth session", error);
        setAuthInitError(true);
      }

      if (!mounted) return;
      setIsAuthenticated(authed);
      setViewerId(sessionUserId);
      setIsHydratingApp(authed && consumePostLoginLoaderFlag());
      setActiveCacheUser(sessionUserId);
      setIsReady(true);

      if (!authed && !isPublicPath) {
        router.replace("/welcome");
      }

      if (authed && pathname === "/welcome") {
        router.replace("/");
      }
    };

    void syncAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const authed = Boolean(session?.user);
      setIsAuthenticated(authed);
      setViewerId(session?.user?.id ?? null);
      const shouldStartHydrationLoader = authed && _event === "SIGNED_IN" && consumePostLoginLoaderFlag();
      if (shouldStartHydrationLoader) {
        setIsHydratingApp(true);
      }
      setActiveCacheUser(session?.user?.id ?? null);

      if (!authed && !isPublicPath) {
        evictCachedValuesByPrefix("home-feed:");
        evictCachedValuesByPrefix("map-spots:");
        evictCachedValuesByPrefix("settings:profile-security:");
        evictCachedValuesByPrefix("gallery-items:");
        evictCachedValuesByPrefix(PROFILE_CACHE_KEY_PREFIX);
        router.replace("/welcome");
      }

      if (authed && pathname === "/welcome") {
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [consumePostLoginLoaderFlag, isPublicPath, pathname, router]);

  const cacheWarmupResponse = useCallback(async (url: string, response: Response) => {
    if (!response.ok) return;
    if (url === POST_LOGIN_HOMEFEED_ENDPOINT) {
      try {
        const payload = (await response.json()) as HomeFeedPayload;
        writeCachedValue(buildUserScopedCacheKey("home-feed"), payload);
        setPrefetchedRouteData("homefeed", payload);
      } catch {
        // warmup cache writes should not block routing
      }
      return;
    }

    if (url === POST_LOGIN_GALLERY_ENDPOINT) {
      try {
        const payload = (await response.json()) as GallerySnapshotPayload;
        setPrefetchedRouteData("gallery-snapshot", payload.items ?? []);
        prefetchGalleryImages(payload);
      } catch {
        // best-effort prefetch should not block routing
      }
      return;
    }

    if (url === POST_LOGIN_MAP_SPOTS_ENDPOINT) {
      try {
        const payload = (await response.json()) as { spots?: unknown[] };
        setPrefetchedRouteData("map-spots", payload.spots ?? []);
      } catch {
        // best-effort prefetch should not block routing
      }
      return;
    }

    if (url === POST_LOGIN_MEMBERS_ENDPOINT) {
      try {
        const payload = (await response.json()) as { members?: unknown[] };
        setPrefetchedRouteData("members-directory", payload.members ?? []);
      } catch {
        // best-effort prefetch should not block routing
      }
      return;
    }

    if (url === POST_LOGIN_PROFILE_ENDPOINT) {
      try {
        const payload = (await response.json()) as ProfileSnapshotPayload;
        setPrefetchedRouteData("profile-snapshot", payload);
      } catch {
        // best-effort prefetch should not block routing
      }
    }
  }, [prefetchGalleryImages]);

  const cacheMemberProfiles = useCallback(async (membersPayload: MemberDirectoryPayload, headers: HeadersInit, viewerUserId: string) => {
    const usernames = (membersPayload.members ?? [])
      .map((member) => (typeof member?.username === "string" ? normalizeUsername(member.username) : ""))
      .filter(Boolean);

    const uniqueUsernames = Array.from(new Set(usernames));

    await Promise.allSettled(uniqueUsernames.map(async (username) => {
      const response = await fetch(`/api/members/${encodeURIComponent(username)}/snapshot`, {
        cache: "no-store",
        headers,
      });

      if (!response.ok) return;
      const payload = (await response.json()) as ProfileSnapshotPayload;
      writeCachedValue(`member-profile:${viewerUserId}:${username}:v1`, payload);
    }));
  }, []);

  const prefetchEndpoints = useCallback(async (
    urls: readonly string[],
    options: { includeAuthToken?: boolean } = {},
  ) => {
    if (warmupInFlightRef.current) return;
    warmupInFlightRef.current = true;
    try {
      const shouldIncludeAuthToken = options.includeAuthToken ?? false;
      let headers: HeadersInit = {};
      let viewerUserId: string | null = null;
      if (shouldIncludeAuthToken) {
        let session;
        try {
          const sessionResult = await supabase.auth.getSession();
          session = sessionResult.data.session;
        } catch (error) {
          console.error("Failed to fetch auth session while warming cache", error);
          return;
        }

        const accessToken = session?.access_token;
        viewerUserId = session?.user?.id ?? null;
        headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      }

      await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: "no-store", headers });

          if (shouldIncludeAuthToken && url === POST_LOGIN_MEMBERS_ENDPOINT && viewerUserId && response.ok) {
            try {
              const membersPayload = (await response.clone().json()) as MemberDirectoryPayload;
              await cacheMemberProfiles(membersPayload, headers, viewerUserId);
            } catch {
              // member profile warmup is best effort only
            }
          }

          if (shouldIncludeAuthToken && url === POST_LOGIN_PROFILE_ENDPOINT && viewerUserId && response.ok) {
            try {
              const profilePayload = (await response.clone().json()) as ProfileSnapshotPayload;
              const profilePagePayload: ProfilePageCachePayload = {
                ...profilePayload,
                friends: [],
              };
              writeCachedValue(`profile:${viewerUserId}:v2`, profilePagePayload);
            } catch {
              // own profile warmup is best effort only
            }
          }

          await cacheWarmupResponse(url, response);
        }),
      );

      if (shouldIncludeAuthToken) {
        lastWarmupAtRef.current = Date.now();
      }
    } finally {
      warmupInFlightRef.current = false;
    }
  }, [cacheMemberProfiles, cacheWarmupResponse]);

  const prefetchHomeFeedUntilReady = useCallback(async (options?: { maxAttempts?: number; retryDelayMs?: number }) => {
    const maxAttempts = options?.maxAttempts ?? 8;
    const retryDelayMs = options?.retryDelayMs ?? 200;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let session;
      try {
        const sessionResult = await supabase.auth.getSession();
        session = sessionResult.data.session;
      } catch (error) {
        console.error("Failed to fetch auth session for homefeed warmup", error);
        return false;
      }
      const accessToken = session?.access_token;

      if (!accessToken) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, retryDelayMs);
        });
        continue;
      }

      const response = await fetch(POST_LOGIN_HOMEFEED_ENDPOINT, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        await cacheWarmupResponse(POST_LOGIN_HOMEFEED_ENDPOINT, response);
        return true;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, retryDelayMs);
      });
    }

    return false;
  }, [cacheWarmupResponse]);

  useEffect(() => {
    if (!pathname || hasPrefetchedBeforeLoginRef.current) return;
    const shouldPrefetchOnEntry = pathname === "/" || pathname === "/welcome";
    if (!shouldPrefetchOnEntry) return;

    CRITICAL_ROUTES_TO_PREFETCH.forEach((route) => {
      void router.prefetch(route);
    });
    void prefetchEndpoints(PRE_LOGIN_DATA_ENDPOINTS);
    hasPrefetchedBeforeLoginRef.current = true;
  }, [pathname, prefetchEndpoints, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (!isColorModePreference(stored)) return;
    applyColorMode(stored);

    if (stored !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onPreferenceChange = () => applyColorMode("system");
    mediaQuery.addEventListener("change", onPreferenceChange);
    return () => mediaQuery.removeEventListener("change", onPreferenceChange);
  }, []);

  useEffect(() => {
    if (!viewerId) return;

    const socialGraphChannel = supabase
      .channel(`social-graph-updates:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `user_id=eq.${viewerId}` },
        emitSocialGraphUpdatedEvent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `friend_user_id=eq.${viewerId}` },
        emitSocialGraphUpdatedEvent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${viewerId}` },
        emitSocialGraphUpdatedEvent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests", filter: `sender_id=eq.${viewerId}` },
        emitSocialGraphUpdatedEvent,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(socialGraphChannel);
    };
  }, [viewerId]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isCancelled = false;

    const completePostLoginHydration = () => {
      if (!isCancelled) {
        setIsHydratingApp(false);
      }
    };

    const prefetchPostLoginCriticalData = async () => {
      await prefetchHomeFeedUntilReady();
      if (isCancelled) return;
    };

    const prefetchPostLoginBackgroundData = async () => {
      BACKGROUND_ROUTES_TO_PREFETCH.forEach((route) => {
        void router.prefetch(route);
      });

      await prefetchEndpoints(POST_LOGIN_BACKGROUND_ENDPOINTS, { includeAuthToken: true });
      if (isCancelled) return;
    };

    CRITICAL_ROUTES_TO_PREFETCH.forEach((route) => {
      void router.prefetch(route);
    });

    const elapsedSinceLastWarmup = Date.now() - lastWarmupAtRef.current;
    if (elapsedSinceLastWarmup < WARMUP_MIN_INTERVAL_MS && !isHydratingApp) {
      return;
    }

    if (isHydratingApp) {
      void prefetchPostLoginCriticalData().finally(() => {
        completePostLoginHydration();
        if (!isCancelled) {
          void prefetchPostLoginBackgroundData();
        }
      });
    } else {
      void prefetchPostLoginCriticalData();
      void prefetchPostLoginBackgroundData();
    }

    const liveUpdatesChannel = supabase.channel("client-cache-live-updates");
    LIVE_TABLES.forEach((table) => {
      liveUpdatesChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          const elapsed = Date.now() - lastWarmupAtRef.current;
          if (elapsed < WARMUP_MIN_INTERVAL_MS || warmupInFlightRef.current) {
            return;
          }
          void prefetchPostLoginCriticalData();
          void prefetchPostLoginBackgroundData();
        },
      );
    });
    void liveUpdatesChannel.subscribe();

    return () => {
      isCancelled = true;
      void supabase.removeChannel(liveUpdatesChannel);
    };
  }, [isAuthenticated, isHydratingApp, prefetchEndpoints, prefetchHomeFeedUntilReady, router]);

  if (isHydratingApp || (!isReady && !isPublicPath)) {
    return (
      <div className={styles.loaderShell}>
        <div className={styles.loaderCard} role="status" aria-live="polite" aria-label="Loading your BareUnity space">
          <div className={styles.rings} aria-hidden="true" />
          <h2 className={styles.title}>Welcome back to BareUnity</h2>
          <p className={styles.message}>
            Preparing your personalized spaces, messages, and map updates so everything is ready the moment you arrive.
          </p>
          <div className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath) {
    return (
      <div className={styles.loaderShell}>
        <div className={styles.loaderCard} role="status" aria-live="polite">
          <h2 className={styles.title}>Let&apos;s get you in</h2>
          <p className={styles.message}>
            {authInitError
              ? "We couldn't check your sign-in status on this browser. You can still continue."
              : "Redirecting you to the welcome page…"}
          </p>
          <Button type="button" onClick={() => router.replace("/welcome")}>
            Open welcome page
          </Button>
        </div>
      </div>
    );
  }

  const showColorModePicker = isAuthenticated && !isPublicPath && !hasSelectedColorMode;

  const onColorModeSelected = (selection: ColorModePreference) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, selection);
    applyColorMode(selection);
    setHasSelectedColorMode(true);
  };

  return (
    <>
      {children}
      {showColorModePicker ? (
        <div className={styles.colorModeOverlay} role="dialog" aria-modal="true" aria-labelledby="color-mode-title">
          <div className={styles.colorModeCard}>
            <h2 id="color-mode-title" className={styles.colorModeTitle}>Choose your theme</h2>
            <p className={styles.colorModeDescription}>Pick how BareUnity should look on this device.</p>
            <div className={styles.colorModeActions}>
              <Button type="button" onClick={() => onColorModeSelected("dark")}>
                Dark
              </Button>
              <Button type="button" onClick={() => onColorModeSelected("light")}>
                Light
              </Button>
              <Button type="button" onClick={() => onColorModeSelected("system")}>
                System
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
