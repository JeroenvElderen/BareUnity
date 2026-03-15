import { supabase } from "@/lib/supabase";

function clearSupabaseAuthCookies() {
  if (typeof document === "undefined") return;

  const cookies = document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0])
    .filter((name) => name.startsWith("sb-") && name.includes("-auth-token"));

  for (const cookieName of cookies) {
    document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}

export async function logoutUser() {
  await supabase.auth.signOut();
  clearSupabaseAuthCookies();
}