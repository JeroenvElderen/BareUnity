import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";

const themeInitScript = `(() => {
  try {
    const DEFAULT_THEME = ${JSON.stringify(DEFAULT_THEME)};
    const KEYS = ['bg','bgSoft','bgDeep','card','card2','text','textStrong','textInverse','muted','border','ring','brand','brand2','accent'];
    const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
    const hexToTriplet = (hex) => {
      const value = hex.replace('#','').trim();
      return parseInt(value.slice(0,2),16) + ' ' + parseInt(value.slice(2,4),16) + ' ' + parseInt(value.slice(4,6),16);
    };

    const raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    let source = null;
    try { source = raw ? JSON.parse(raw) : null; } catch {}

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
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
