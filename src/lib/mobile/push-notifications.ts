"use client";

import { PushNotifications } from "@capacitor/push-notifications";

export async function registerPushNotifications() {
  console.log("Push registration called");

  const permission = await PushNotifications.requestPermissions();

  console.log("Permission result:", permission);

  if (permission.receive !== "granted") {
    console.log("Permission denied");
    return;
  }

  console.log("Registering...");

  await PushNotifications.register();

  PushNotifications.addListener("registration", (token) => {
    console.log("FCM TOKEN:", token.value);
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("FCM ERROR:", error);
  });
}