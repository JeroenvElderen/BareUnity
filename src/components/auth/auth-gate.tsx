"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { evictCachedValuesByPrefix, writeCachedValue } from "@/lib/client-cache";
import { supabase } from "@/lib/supabase";

import styles from "./auth-gate.module.css";

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register"]);
const PROFILE_CACHE_KEY_PREFIX = "profile:";
const LIVE_TABLES = ["posts", "comments", "friendships", "profiles", "profile_settings", "map_spots"] as const;
const POST_LOGIN_LOADER_FLAG = "bareunity_post_login_loading";

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isHydratingApp, setIsHydratingApp] = useState(false);

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

      if (!authed && !isPublicPath) {
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
    let refreshTimer: number | null = null;

    const completePostLoginHydration = () => {
      window.sessionStorage.removeItem(POST_LOGIN_LOADER_FLAG);
      if (!isCancelled) {
        setIsHydratingApp(false);
      }
    };

    const prefetchCoreData = async (options?: { invalidateProfileCache?: boolean }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (isCancelled) return;

      const accessToken = session?.access_token;
      const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

      const warmupTargets: Array<{ url: string; cacheKey: string; valuePath: "identity" | "spots" }> = [
        { url: "/api/homefeed", cacheKey: "home-feed:v1", valuePath: "identity" },
        { url: "/api/map-spots", cacheKey: "map-spots:v1", valuePath: "spots" },
      ];

      await Promise.all(
        warmupTargets.map(async (target) => {
          try {
            const response = await fetch(target.url, { cache: "no-store", headers });
            if (!response.ok) return;
            const payload = (await response.json()) as { spots?: unknown[] };
            writeCachedValue(target.cacheKey, target.valuePath === "spots" ? (payload.spots ?? []) : payload);
          } catch {
            // warmup failures should not block routing
          }
        }),
      );

      if (options?.invalidateProfileCache) {
        evictCachedValuesByPrefix(PROFILE_CACHE_KEY_PREFIX);
      }
    };

    if (isHydratingApp) {
      void prefetchCoreData({ invalidateProfileCache: true }).finally(() => {
        completePostLoginHydration();
      });
    } else {
      void prefetchCoreData();
    }

    const scheduleRefresh = (options?: { invalidateProfileCache?: boolean }) => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void prefetchCoreData(options);
      }, 450);
    };

    const liveUpdatesChannel = supabase.channel("client-cache-live-updates");
    LIVE_TABLES.forEach((table) => {
      liveUpdatesChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          scheduleRefresh({ invalidateProfileCache: true });
        },
      );
    });
    void liveUpdatesChannel.subscribe();

    return () => {
      isCancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(liveUpdatesChannel);
    };
  }, [isAuthenticated, isHydratingApp]);

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
