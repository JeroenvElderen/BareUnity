"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildUserScopedCacheKey,
  evictCachedValuesByPrefix,
  setActiveCacheUser,
  writeCachedValue,
} from "@/lib/client-cache";
import type { HomeFeedPayload } from "@/lib/homefeed";
import { supabase } from "@/lib/supabase";

import styles from "./auth-gate.module.css";

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register"]);
const PROFILE_CACHE_KEY_PREFIX = "profile:";
const LIVE_TABLES = ["posts", "comments", "friendships", "profiles", "profile_settings", "map_spots"] as const;
const POST_LOGIN_LOADER_FLAG = "bareunity_post_login_loading";
const APP_ROUTES_TO_PREFETCH = [
  "/",
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
  "/api/map-spots",
  "/api/settings/snapshot",
  "/api/gallery/snapshot",
];
const POST_LOGIN_DATA_ENDPOINTS = ["/api/map-spots", "/api/settings/snapshot", "/api/gallery/snapshot"];
const POST_LOGIN_HOMEFEED_ENDPOINT = "/api/homefeed";
const POST_LOGIN_PROFILE_ENDPOINT = "/api/profile/snapshot";
const WARMUP_MIN_INTERVAL_MS = 5 * 60_000;

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isHydratingApp, setIsHydratingApp] = useState(false);
  const lastWarmupAtRef = useRef(0);
  const warmupInFlightRef = useRef(false);
  const hasPrefetchedBeforeLoginRef = useRef(false);

  const isPublicPath = useMemo(() => {
    if (!pathname) return false;
    if (PUBLIC_PATHS.has(pathname)) return true;
    return pathname.startsWith("/api") || pathname.startsWith("/_next");
  }, [pathname]);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      const authed = Boolean(session?.user);
      setIsAuthenticated(authed);
      setIsHydratingApp(authed && window.sessionStorage.getItem(POST_LOGIN_LOADER_FLAG) === "true");
      setActiveCacheUser(session?.user?.id ?? null);
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
      setIsHydratingApp(authed && window.sessionStorage.getItem(POST_LOGIN_LOADER_FLAG) === "true");
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
  }, [isPublicPath, pathname, router]);

  const cacheWarmupResponse = useCallback(async (url: string, response: Response) => {
    if (!response.ok) return;
    if (url !== POST_LOGIN_HOMEFEED_ENDPOINT) return;

    try {
      const payload = (await response.json()) as HomeFeedPayload;
      writeCachedValue(buildUserScopedCacheKey("home-feed"), payload);
    } catch {
      // warmup cache writes should not block routing
    }
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
      if (shouldIncludeAuthToken) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;
        headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      }

      await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: "no-store", headers });
          await cacheWarmupResponse(url, response);
        }),
      );

      if (shouldIncludeAuthToken) {
        lastWarmupAtRef.current = Date.now();
      }
    } finally {
      warmupInFlightRef.current = false;
    }
  }, [cacheWarmupResponse]);

  const prefetchHomeFeedUntilReady = useCallback(async (options?: { maxAttempts?: number; retryDelayMs?: number }) => {
    const maxAttempts = options?.maxAttempts ?? 8;
    const retryDelayMs = options?.retryDelayMs ?? 200;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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

    APP_ROUTES_TO_PREFETCH.forEach((route) => {
      void router.prefetch(route);
    });
    void prefetchEndpoints(PRE_LOGIN_DATA_ENDPOINTS);
    hasPrefetchedBeforeLoginRef.current = true;
  }, [pathname, prefetchEndpoints, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isCancelled = false;

    const completePostLoginHydration = () => {
      window.sessionStorage.removeItem(POST_LOGIN_LOADER_FLAG);
      if (!isCancelled) {
        setIsHydratingApp(false);
      }
    };

    const prefetchPostLoginData = async () => {
      await prefetchEndpoints(POST_LOGIN_DATA_ENDPOINTS);
      if (isCancelled) return;

      await prefetchEndpoints([POST_LOGIN_PROFILE_ENDPOINT], { includeAuthToken: true });
      if (isCancelled) return;

      await prefetchHomeFeedUntilReady();
      if (isCancelled) return;
    };

    APP_ROUTES_TO_PREFETCH.forEach((route) => {
      void router.prefetch(route);
    });

    const elapsedSinceLastWarmup = Date.now() - lastWarmupAtRef.current;
    if (elapsedSinceLastWarmup < WARMUP_MIN_INTERVAL_MS && !isHydratingApp) {
      return;
    }

    if (isHydratingApp) {
      void prefetchPostLoginData().finally(() => {
        completePostLoginHydration();
      });
    } else {
      void prefetchPostLoginData();
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
          void prefetchPostLoginData();
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
    return null;
  }

  return <>{children}</>;
}
