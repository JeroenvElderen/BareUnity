export type OptionState = "No-one" | "Members only" | "Everyone";

export const SETTING_OPTION_DEFAULTS: Record<string, OptionState> = {
  "privacy.Profile visibility": "Everyone",
  "privacy.Display name visibility": "Everyone",
  "privacy.Location precision": "No-one",
};

export function normalizeSettingOptionStates(value: unknown) {
  const states: Record<string, OptionState> = { ...SETTING_OPTION_DEFAULTS };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return states;
  }

  for (const [key, state] of Object.entries(value)) {
    if (!(key in SETTING_OPTION_DEFAULTS)) continue;

    if (
      state === "No-one" ||
      state === "Members only" ||
      state === "Friends only" ||
      state === "Everyone"
    ) {
      states[key] = state === "Friends only" ? "Members only" : state;
    }
  }

  return states;
}