export const THEME_STORAGE_KEY = "bareunity-theme";

export type ThemeTokens = {
  bg: string;
  bgSoft: string;
  bgDeep: string;
  card: string;
  card2: string;
  text: string;
  textStrong: string;
  textInverse: string;
  muted: string;
  border: string;
  ring: string;
  brand: string;
  brand2: string;
  accent: string;
};

export const DEFAULT_THEME: ThemeTokens = {
  bg: "#101922",
  bgSoft: "#14212d",
  bgDeep: "#0a121a",
  card: "#1e2e3d",
  card2: "#26394b",
  text: "#e2ecf2",
  textStrong: "#f2fff9",
  textInverse: "#0c1822",
  muted: "#96aaba",
  border: "#48667c",
  ring: "#6fa79a",
  brand: "#4a7d6e",
  brand2: "#466e92",
  accent: "#8abcb1",
};

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return [16, 25, 34];
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function toTriplet(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function clamp(value: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  ratio: number,
): [number, number, number] {
  const r = Math.max(0, Math.min(1, ratio));
  return [
    clamp(a[0] * (1 - r) + b[0] * r),
    clamp(a[1] * (1 - r) + b[1] * r),
    clamp(a[2] * (1 - r) + b[2] * r),
  ];
}

function shift(rgb: [number, number, number], amount: number): [number, number, number] {
  return [clamp(rgb[0] + amount), clamp(rgb[1] + amount), clamp(rgb[2] + amount)];
}

function rgbToHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((value) => clamp(value).toString(16).padStart(2, "0")).join("")}`;
}

// Backward compatibility: migrate old {baseColor, accentColor} shape.
function migrateLegacyTheme(value: unknown): ThemeTokens | null {
  if (!value || typeof value !== "object") return null;

  const maybe = value as { baseColor?: unknown; accentColor?: unknown };
  if (typeof maybe.baseColor !== "string" || typeof maybe.accentColor !== "string") {
    return null;
  }

  const base = hexToRgb(maybe.baseColor);
  const accent = hexToRgb(maybe.accentColor);

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
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function normalizeTheme(input: unknown): ThemeTokens {
  const migrated = migrateLegacyTheme(input);
  if (migrated) return migrated;

  const source = typeof input === "object" && input ? (input as Partial<ThemeTokens>) : {};

  return {
    bg: isHex(source.bg) ? source.bg : DEFAULT_THEME.bg,
    bgSoft: isHex(source.bgSoft) ? source.bgSoft : DEFAULT_THEME.bgSoft,
    bgDeep: isHex(source.bgDeep) ? source.bgDeep : DEFAULT_THEME.bgDeep,
    card: isHex(source.card) ? source.card : DEFAULT_THEME.card,
    card2: isHex(source.card2) ? source.card2 : DEFAULT_THEME.card2,
    text: isHex(source.text) ? source.text : DEFAULT_THEME.text,
    textStrong: isHex(source.textStrong) ? source.textStrong : DEFAULT_THEME.textStrong,
    textInverse: isHex(source.textInverse) ? source.textInverse : DEFAULT_THEME.textInverse,
    muted: isHex(source.muted) ? source.muted : DEFAULT_THEME.muted,
    border: isHex(source.border) ? source.border : DEFAULT_THEME.border,
    ring: isHex(source.ring) ? source.ring : DEFAULT_THEME.ring,
    brand: isHex(source.brand) ? source.brand : DEFAULT_THEME.brand,
    brand2: isHex(source.brand2) ? source.brand2 : DEFAULT_THEME.brand2,
    accent: isHex(source.accent) ? source.accent : DEFAULT_THEME.accent,
  };
}

export function parseStoredTheme(raw: string | null): ThemeTokens {
  if (!raw) return DEFAULT_THEME;

  try {
    return normalizeTheme(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeTokens, root: HTMLElement) {
  const normalized = normalizeTheme(theme);

  root.style.setProperty("--bg", toTriplet(normalized.bg));
  root.style.setProperty("--bg-soft", toTriplet(normalized.bgSoft));
  root.style.setProperty("--bg-deep", toTriplet(normalized.bgDeep));
  root.style.setProperty("--card", toTriplet(normalized.card));
  root.style.setProperty("--card-2", toTriplet(normalized.card2));
  root.style.setProperty("--text", toTriplet(normalized.text));
  root.style.setProperty("--text-strong", toTriplet(normalized.textStrong));
  root.style.setProperty("--text-inverse", toTriplet(normalized.textInverse));
  root.style.setProperty("--muted", toTriplet(normalized.muted));
  root.style.setProperty("--border", toTriplet(normalized.border));
  root.style.setProperty("--ring", toTriplet(normalized.ring));
  root.style.setProperty("--brand", toTriplet(normalized.brand));
  root.style.setProperty("--brand-2", toTriplet(normalized.brand2));
  root.style.setProperty("--accent", toTriplet(normalized.accent));
}
