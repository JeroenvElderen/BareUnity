"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { evictCachedValuesByPrefix, writeCachedValue } from "@/lib/client-cache";
import { supabase } from "@/lib/supabase";

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register"]);
const PROFILE_CACHE_KEY_PREFIX = "profile:";
const LIVE_TABLES = ["posts", "comments", "friendships", "profiles", "profile_settings", "map_spots"] as const;

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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

    void prefetchCoreData();

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
  }, [isAuthenticated]);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--bg))] text-sm text-[rgb(var(--muted))]">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath) {
    return null;
  }

  return <>{children}</>;
}
