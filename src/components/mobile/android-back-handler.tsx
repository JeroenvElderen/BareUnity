"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { App } from "@capacitor/app";

export function AndroidBackHandler() {
  const pathname = usePathname();

  useEffect(() => {
    const listener = App.addListener("backButton", () => {
      if (pathname === "/" || pathname === "/explore") {
        App.exitApp();
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, [pathname]);

  return null;
}
