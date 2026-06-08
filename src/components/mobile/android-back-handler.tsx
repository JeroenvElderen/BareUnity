"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";

export function AndroidBackHandler() {
  useEffect(() => {
    const listener = App.addListener("backButton", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  return null;
}