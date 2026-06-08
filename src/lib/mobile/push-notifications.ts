"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

export async function registerPushNotifications() {
  try {
    console.log("=== PUSH START ===");

    setupPushNotificationListeners();

    const permission = await PushNotifications.requestPermissions();

    console.log("=== PERMISSION ===", JSON.stringify(permission));

    if (permission.receive !== "granted") {
      console.log("=== PERMISSION DENIED ===");
      return;
    }

    console.log("=== REGISTERING ===");

    await PushNotifications.register();

    console.log("=== REGISTER CALLED ===");
  } catch (error) {
    console.error("=== PUSH ERROR ===", error);
  }
}

export function setupPushNotificationListeners() {
  PushNotifications.addListener("registration", async (token) => {
    console.log("=== FCM TOKEN ===", token.value);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.log("=== NO AUTHENTICATED USER ===");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          push_token: token.value,
        })
        .eq("id", user.id);

      if (error) {
        console.error("=== TOKEN SAVE ERROR ===", error);
      } else {
        console.log("=== TOKEN SAVED SUCCESSFULLY ===");
      }
    } catch (error) {
      console.error("=== TOKEN SAVE EXCEPTION ===", error);
    }
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("=== FCM ERROR ===", JSON.stringify(error));
  });

  PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      console.log(
        "=== PUSH RECEIVED ===",
        JSON.stringify(notification)
      );
    }
  );

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (notification) => {
      console.log(
        "=== PUSH ACTION ===",
        JSON.stringify(notification)
      );
    }
  );
}