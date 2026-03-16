"use client";

import { useEffect, useState } from "react";
import { applyTheme, DEFAULT_THEME, parseStoredTheme, THEME_STORAGE_KEY, type ThemeTokens } from "@/lib/theme";

const TOKEN_FIELDS: Array<{ key: keyof ThemeTokens; label: string }> = [
  { key: "bg", label: "Background" },
  { key: "bgSoft", label: "Background soft" },
  { key: "bgDeep", label: "Background deep" },
  { key: "card", label: "Card" },
  { key: "card2", label: "Card alt" },
  { key: "text", label: "Text" },
  { key: "textStrong", label: "Text strong" },
  { key: "textInverse", label: "Text inverse" },
  { key: "muted", label: "Muted text" },
  { key: "border", label: "Border / lines" },
  { key: "ring", label: "Focus ring" },
  { key: "brand", label: "Brand" },
  { key: "brand2", label: "Brand alt" },
  { key: "accent", label: "Accent" },
];

export default function ThemeCustomizer() {
  const [theme, setTheme] = useState<ThemeTokens>(() => parseStoredTheme(typeof window === "undefined" ? null : window.localStorage.getItem(THEME_STORAGE_KEY)));

  useEffect(() => {
    applyTheme(theme, document.documentElement);
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  return (
    <div className="glass-card space-y-4 p-5">
      <div>
        <h3 className="text-xl font-semibold text-text">Theme colors</h3>
        <p className="mt-1 text-sm text-muted">Customize all core colors (backgrounds, borders, text, accents and brand gradients).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOKEN_FIELDS.map((field) => (
          <label key={field.key} className="grid gap-2 text-xs text-muted">
            <span className="font-medium text-text">{field.label}</span>
            <input
              type="color"
              value={theme[field.key]}
              onChange={(event) => setTheme((current) => ({ ...current, [field.key]: event.target.value }))}
              className="h-10 w-full cursor-pointer rounded-lg border border-accent/35 bg-card/70 p-1"
            />
          </label>
        ))}
      </div>

      <button type="button" onClick={() => setTheme(DEFAULT_THEME)} className="soft-button">
        Reset to default palette
      </button>
    </div>
  );
}
