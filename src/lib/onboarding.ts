export const PLATFORM_ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

export const USER_ROLES = ["newcomer", "organizer", "traveler", "mentor", "club_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = "newcomer";

export const PROFILE_INTERESTS = ["beaches", "hiking", "sauna", "art", "wellness"] as const;
export type ProfileInterest = (typeof PROFILE_INTERESTS)[number];

export function isPlatformAdmin(email: string | null | undefined) {
  return (email ?? "").toLowerCase() === PLATFORM_ADMIN_EMAIL;
}