import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";

const themeInitScript = `(() => {
  try {
    const DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
    const KEYS = ['bg','bgSoft','bgDeep','card','card2','text','textStrong','textInverse','muted','border','ring','brand','brand2','accent'];
    const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
    const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, Math.round(value)));
    const hexToRgb = (hex) => {
      const value = hex.replace('#','').trim();
      if (!/^[0-9a-fA-F]{6}$/.test(value)) return [16, 25, 34];
      return [parseInt(value.slice(0,2),16), parseInt(value.slice(2,4),16), parseInt(value.slice(4,6),16)];
    };
    const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, ratio) => {
      const r = Math.max(0, Math.min(1, ratio));
      return [
        clamp(a[0] * (1 - r) + b[0] * r),
        clamp(a[1] * (1 - r) + b[1] * r),
        clamp(a[2] * (1 - r) + b[2] * r),
      ];
    };
    const shift = (rgb, amount) => [clamp(rgb[0] + amount), clamp(rgb[1] + amount), clamp(rgb[2] + amount)];
    const buildThemeFromMainAccent = (mainColor, accentColor) => {
      const base = hexToRgb(mainColor);
      const accent = hexToRgb(accentColor);
      return {
        bg: rgbToHex(shift(base, -42)),
        bgSoft: rgbToHex(shift(base, -30)),
        bgDeep: rgbToHex(shift(base, -52)),
        card: rgbToHex(mix(base, accent, 0.16)),
        card2: rgbToHex(mix(base, accent, 0.28)),
        text: rgbToHex(mix([245, 250, 252], accent, 0.12)),
        textStrong: rgbToHex(mix([255, 255, 255], accent, 0.08)),
        textInverse: rgbToHex(mix(shift(base, -52), [255, 255, 255], 0.05)),
        muted: rgbToHex(mix([170, 180, 195], base, 0.2)),
        border: rgbToHex(mix(accent, shift(base, -30), 0.52)),
        ring: rgbToHex(mix(accent, [255, 255, 255], 0.16)),
        brand: rgbToHex(mix(base, accent, 0.32)),
        brand2: rgbToHex(mix(base, accent, 0.5)),
        accent: rgbToHex(accent),
      };
    };
    const hexToTriplet = (hex) => {
      const value = hex.replace('#','').trim();
      return parseInt(value.slice(0,2),16) + ' ' + parseInt(value.slice(2,4),16) + ' ' + parseInt(value.slice(4,6),16);
    };

    const raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    let source = null;
    try { source = raw ? JSON.parse(raw) : null; } catch {}

    if (source && (typeof source.mainColor === 'string' || typeof source.baseColor === 'string') && typeof source.accentColor === 'string') {
      const mainColor = typeof source.mainColor === 'string' ? source.mainColor : source.baseColor;
      if (isHex(mainColor) && isHex(source.accentColor)) {
        source = buildThemeFromMainAccent(mainColor, source.accentColor);
      }
    }

    const theme = {};
    for (const key of KEYS) {
      const next = source && isHex(source[key]) ? source[key] : DEFAULT_THEME[key];
      theme[key] = next;
    }

    const root = document.documentElement;
    root.style.setProperty('--bg', hexToTriplet(theme.bg));
    root.style.setProperty('--bg-soft', hexToTriplet(theme.bgSoft));
    root.style.setProperty('--bg-deep', hexToTriplet(theme.bgDeep));
    root.style.setProperty('--card', hexToTriplet(theme.card));
    root.style.setProperty('--card-2', hexToTriplet(theme.card2));
    root.style.setProperty('--text', hexToTriplet(theme.text));
    root.style.setProperty('--text-strong', hexToTriplet(theme.textStrong));
    root.style.setProperty('--text-inverse', hexToTriplet(theme.textInverse));
    root.style.setProperty('--muted', hexToTriplet(theme.muted));
    root.style.setProperty('--border', hexToTriplet(theme.border));
    root.style.setProperty('--ring', hexToTriplet(theme.ring));
    root.style.setProperty('--brand', hexToTriplet(theme.brand));
    root.style.setProperty('--brand-2', hexToTriplet(theme.brand2));
    root.style.setProperty('--accent', hexToTriplet(theme.accent));
  } catch {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-text antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
