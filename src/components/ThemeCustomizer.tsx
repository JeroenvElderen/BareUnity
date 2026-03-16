"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  buildThemeFromMainAccent,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_MAIN_COLOR,
  parseStoredTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

export default function ThemeCustomizer() {
  const [mainColor, setMainColor] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_MAIN_COLOR;
    const stored = parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    return stored.bgSoft;
  });
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_ACCENT_COLOR;
    const stored = parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    return stored.accent;
  });

  const derivedTheme = useMemo(() => buildThemeFromMainAccent(mainColor, accentColor), [mainColor, accentColor]);

  useEffect(() => {
    applyTheme(derivedTheme, document.documentElement);
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(derivedTheme));
  }, [derivedTheme]);

  return (
    <div className="glass-card space-y-4 p-5">
      <div>
        <h3 className="text-xl font-semibold text-text">Theme colors</h3>
        <p className="mt-1 text-sm text-muted">Pick a main color and an accent. We automatically balance backgrounds, text, borders, and brand tones.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-xs text-muted">
          <span className="font-medium text-text">Main color</span>
          <input
            type="color"
            value={mainColor}
            onChange={(event) => setMainColor(event.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-accent/35 bg-card/70 p-1"
          />
        </label>
        <label className="grid gap-2 text-xs text-muted">
          <span className="font-medium text-text">Accent color</span>
          <input
            type="color"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-accent/35 bg-card/70 p-1"
          />
        </label>
      </div>

      <button type="button" onClick={() => {
        setMainColor(DEFAULT_MAIN_COLOR);
        setAccentColor(DEFAULT_ACCENT_COLOR);
      }} className="soft-button">
        Reset to default palette
      </button>
    </div>
  );
}
