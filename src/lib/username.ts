const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;

export function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

export function isUsernameValid(value: string) {
  return /^[a-z0-9_](?:[a-z0-9_-]{1,22}[a-z0-9_])?$/.test(value);
}

export function getUsernameValidationMessage(value: string) {
  if (!value) return "Choose a username";
  if (value.length < USERNAME_MIN_LENGTH) return `Use at least ${USERNAME_MIN_LENGTH} characters`;
  if (value.length > USERNAME_MAX_LENGTH) return `Use no more than ${USERNAME_MAX_LENGTH} characters`;
  if (!isUsernameValid(value)) return "Use lowercase letters, numbers, _ or -";
  return null;
}

export function createUsernameSuggestions(base: string) {
  const normalizedBase = normalizeUsername(base) || "naturist";
  const suffixes = ["sun", "trail", "grove", "north", "wild", "collective"];

  return [
    normalizedBase,
    ...suffixes.map((suffix) => `${normalizedBase}-${suffix}`),
    `${normalizedBase}-${Math.floor(100 + Math.random() * 900)}`,
  ].filter((candidate, index, all) => index === all.indexOf(candidate));
}

export { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH };