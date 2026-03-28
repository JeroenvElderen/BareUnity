import type { User } from "@supabase/supabase-js";
import { DEFAULT_ROLE, PROFILE_INTERESTS, type ProfileInterest, type UserRole } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { normalizeUsername } from "@/lib/username";

function getProfileUsername(user: User) {
  const rawUsername = user.user_metadata?.username || user.email?.split("@")[0] || "naturist";
  return normalizeUsername(String(rawUsername)).slice(0, 24) || `naturist-${user.id.slice(0, 6)}`;
}

async function getAvailableUsername(baseUsername: string) {
  const { data: exact } = await supabase.from("profiles").select("id").eq("username", baseUsername).limit(1);
  if (!exact?.length) return baseUsername;

  for (let i = 1; i <= 12; i += 1) {
    const candidate = `${baseUsername}-${i}`.slice(0, 24);
    const { data } = await supabase.from("profiles").select("id").eq("username", candidate).limit(1);
    if (!data?.length) return candidate;
  }

  return `${baseUsername.slice(0, 18)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

type EnsureProfileOptions = {
  role?: UserRole;
  interests?: ProfileInterest[];
};

export async function ensureProfileExists(user: User, options: EnsureProfileOptions = {}) {
  const username = await getAvailableUsername(getProfileUsername(user));
  const role = options.role ?? DEFAULT_ROLE;
  const interests = (options.interests ?? []).filter((entry): entry is ProfileInterest => PROFILE_INTERESTS.includes(entry));

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to create profile record", error);
  }

  const { error: profileSettingsError } = await supabase.from("profile_settings").upsert(
    {
      user_id: user.id,
      user_role: role,
      interests,
      onboarding_completed: true,
      recovery_keys: [],
    },
    { onConflict: "user_id" },
  );

  if (profileSettingsError && !profileSettingsError.message.includes("user_role")) {
    console.error("Failed to create profile settings record", profileSettingsError);
  }
}