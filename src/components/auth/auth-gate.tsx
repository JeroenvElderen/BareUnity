"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { evictCachedValuesByPrefix, setActiveCacheUser } from "@/lib/client-cache";
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
const CORE_DATA_ENDPOINTS = [
  "/api/homefeed",
  "/api/map-spots",
  "/api/profile/snapshot",
  "/api/settings/snapshot",
  "/api/gallery/snapshot",
];
const WARMUP_MIN_INTERVAL_MS = 5 * 60_000;

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isHydratingApp, setIsHydratingApp] = useState(false);
  const lastWarmupAtRef = useRef(0);
  const warmupInFlightRef = useRef(false);

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

  useEffect(() => {
    if (!isAuthenticated) return;

    let isCancelled = false;

    const completePostLoginHydration = () => {
      window.sessionStorage.removeItem(POST_LOGIN_LOADER_FLAG);
      if (!isCancelled) {
        setIsHydratingApp(false);
      }
    };

    const prefetchCoreData = async () => {
      if (warmupInFlightRef.current) return;
      warmupInFlightRef.current = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isCancelled) return;

        const accessToken = session?.access_token;
        const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

        for (const url of CORE_DATA_ENDPOINTS) {
          try {
            await fetch(url, { cache: "no-store", headers });
          } catch {
            // warmup failures should not block routing
          }
        }
        lastWarmupAtRef.current = Date.now();
      } finally {
        warmupInFlightRef.current = false;
      }
    };

    APP_ROUTES_TO_PREFETCH.forEach((route) => {
      void router.prefetch(route);
    });

    const elapsedSinceLastWarmup = Date.now() - lastWarmupAtRef.current;
    if (elapsedSinceLastWarmup < WARMUP_MIN_INTERVAL_MS && !isHydratingApp) {
      return;
    }

    if (isHydratingApp) {
      void prefetchCoreData().finally(() => {
        completePostLoginHydration();
      });
    } else {
      void prefetchCoreData();
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
          void prefetchCoreData();
        },
      );
    });
    void liveUpdatesChannel.subscribe();

    return () => {
      isCancelled = true;
      void supabase.removeChannel(liveUpdatesChannel);
    };
  }, [isAuthenticated, isHydratingApp, router]);

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
