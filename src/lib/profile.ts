import type { User } from "@supabase/supabase-js";
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

export async function ensureProfileExists(user: User) {
  const username = await getAvailableUsername(getProfileUsername(user));

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
}