"use client";

import { useEffect } from "react";
import { applyTheme, parseStoredTheme, THEME_STORAGE_KEY } from "@/lib/theme";

export default function ThemeManager() {
  useEffect(() => {
    applyTheme(parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY)), document.documentElement);
  }, []);

  return null;
}
