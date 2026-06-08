import { supabaseServer } from "@/lib/supabase-server";

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  detail: string;
  targetHref?: string;
}

export async function createNotification(
  input: CreateNotificationInput
) {
  return supabaseServer
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      detail: input.detail,
      target_href: input.targetHref ?? null,
    });
}