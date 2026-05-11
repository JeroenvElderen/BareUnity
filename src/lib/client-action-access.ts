import { supabase } from "@/lib/supabase";

export const VIEW_ONLY_ACTION_MESSAGE =
  "Your Visitor Pass lets you browse and preview BareUnity, but posting, messaging, friend requests, check-ins, and submissions require ID verification.";

type ActionSettingsRow = {
  onboarding_completed: boolean | null;
  user_role: string | null;
};

export async function canCurrentUserAct(userId: string) {
  const { data, error } = await supabase
    .from("profile_settings")
    .select("onboarding_completed,user_role")
    .eq("user_id", userId)
    .maybeSingle<ActionSettingsRow>();

  if (error) {
    console.warn("Could not load account access state", error.message);
    return false;
  }

  if (!data) return false;
  if (data.user_role === "view_only") return false;
  return data.onboarding_completed === true;
}
