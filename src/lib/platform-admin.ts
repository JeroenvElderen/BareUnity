const DEVELOPMENT_ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

function parseAdminEmails(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getPlatformAdminEmails() {
  const configuredEmails = parseAdminEmails(
    process.env.PLATFORM_ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS,
  );

  if (configuredEmails.length > 0) {
    return configuredEmails;
  }

  if (process.env.NODE_ENV !== "production") {
    return [DEVELOPMENT_ADMIN_EMAIL];
  }

  return [];
}

export function isPlatformAdminEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return getPlatformAdminEmails().includes(normalizedEmail);
}

export function hasConfiguredPlatformAdmins() {
  return getPlatformAdminEmails().length > 0;
}
