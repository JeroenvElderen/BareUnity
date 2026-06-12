import { getFirebaseMessaging } from "@/lib/firebase-admin";
import { supabaseServer } from "@/lib/supabase-server";

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  detail: string;
  targetHref?: string;
}

type PushTokenRow = {
  push_token?: string | null;
};

function toPushData(input: CreateNotificationInput, notificationId?: string) {
  return Object.fromEntries(
    Object.entries({
      notificationId: notificationId ?? "",
      type: input.type,
      targetHref: input.targetHref ?? "/notifications",
    }).filter(([, value]) => value.length > 0),
  );
}

async function sendMobilePushNotification(
  input: CreateNotificationInput,
  notificationId?: string,
) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("push_token")
    .eq("id", input.userId)
    .maybeSingle<PushTokenRow>();

  const pushToken = profile?.push_token?.trim();
  if (!pushToken) return;

  try {
    await messaging.send({
      token: pushToken,
      notification: {
        title: input.title,
        body: input.detail,
      },
      data: toPushData(input, notificationId),
      android: {
        priority: "high",
        notification: {
          channelId: "default",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });
  } catch (error) {
    console.warn("Could not send mobile push notification", error);
  }
}

export async function createNotification(input: CreateNotificationInput) {
  const result = await supabaseServer
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      detail: input.detail,
      target_href: input.targetHref ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!result.error) {
    await sendMobilePushNotification(input, result.data?.id);
  }

  return result;
}
