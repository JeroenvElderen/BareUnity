"use client";

import { PushNotifications } from "@capacitor/push-notifications";

export async function registerPushNotifications() {
  alert("PUSH START");
    
  try {
    console.log("=== PUSH START ===");

    const permission = await PushNotifications.requestPermissions();

    console.log("=== PERMISSION ===", JSON.stringify(permission));

    if (permission.receive !== "granted") {
      console.log("=== NOT GRANTED ===");
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
  PushNotifications.addListener("registration", (token) => {
    console.log("=== FCM TOKEN ===", token.value);
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