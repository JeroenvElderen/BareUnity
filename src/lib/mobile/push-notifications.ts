"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

let listenersRegistered = false;
let registrationInFlight = false;

function isNativePushAvailable() {
  return Capacitor.isNativePlatform();
}

export async function registerPushNotifications() {
  if (!isNativePushAvailable() || registrationInFlight) return;

  try {
    registrationInFlight = true;
    setupPushNotificationListeners();

    const permission = await PushNotifications.requestPermissions();

    if (permission.receive !== "granted") {
      console.log("Push notification permission denied");
      return;
    }

    await PushNotifications.register();
  } catch (error) {
    console.error("Push notification registration failed", error);
  } finally {
    registrationInFlight = false;
  }
}

export function setupPushNotificationListeners() {
  if (!isNativePushAvailable() || listenersRegistered) return;
  listenersRegistered = true;

  PushNotifications.addListener("registration", async (token) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("Push token received before authentication");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          push_token: token.value,
        })
        .eq("id", user.id);

      if (error) {
        console.error("Push token save failed", error);
      }
    } catch (error) {
      console.error("Push token save failed", error);
    }
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Push notification registration error", error);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push notification received", notification);
  });

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (notification) => {
      const targetHref = notification.notification.data?.targetHref;
      if (typeof targetHref === "string" && targetHref.length > 0) {
        window.location.assign(targetHref);
      }
    },
  );
}
