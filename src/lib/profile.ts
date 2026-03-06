import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function getProfileUsername(user: User) {
  const rawUsername = user.user_metadata?.username || user.email?.split("@")[0] || "naturist";
  return String(rawUsername).slice(0, 32);
}

export async function ensureProfileExists(user: User) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: getProfileUsername(user),
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to create profile record", error);
  }
}