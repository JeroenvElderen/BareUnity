export const COLOR_MODE_STORAGE_KEY = "bareunity-color-mode";

export type ColorModePreference = "light" | "dark" | "system";
export type ResolvedColorMode = "light" | "dark";

export function isColorModePreference(value: string | null): value is ColorModePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveColorMode(preference: ColorModePreference): ResolvedColorMode {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyColorMode(preference: ColorModePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.colorMode = resolveColorMode(preference);
  document.documentElement.dataset.colorModePreference = preference;
}