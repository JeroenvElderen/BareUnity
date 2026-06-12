import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let cachedMessaging: Messaging | null | undefined;

export function getFirebaseMessaging() {
  if (cachedMessaging !== undefined) return cachedMessaging;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    cachedMessaging = null;
    return cachedMessaging;
  }

  try {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

    cachedMessaging = getMessaging(app);
  } catch (error) {
    console.warn("Firebase Admin messaging is unavailable", error);
    cachedMessaging = null;
  }

  return cachedMessaging;
}
