"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type AuthGateProps = {
  children: ReactNode;
};

const PUBLIC_PATHS = new Set(["/welcome", "/login", "/register"]);

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