import { create } from "zustand";

export type AppNotificationType =
  | "post-like"
  | "post-comment"
  | "gallery-like"
  | "general-message"
  | "video-visitor"
  | "map-entry"
  | "admin-report"
  | "admin-registration"
  | "admin-feedback"
  | "admin-location"
  | "admin-verification"
  | "verification-decision"
  | "friend-request";

export type AppNotification = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  type: AppNotificationType;
  unread: boolean;
  targetHref?: string;
};

const MAX_PERSISTED_READ_NOTIFICATION_IDS = 500;

type UIState = {
  sidebarOpen: boolean;
  notifications: AppNotification[];
  notificationReadStorageKey: string | null;
  isMessagesOpen: boolean;
  toggleSidebar: () => void;
  toggleMessages: () => void;
  closeMessages: () => void;
  openMessages: () => void;
  clearNotifications: () => void;
  setNotifications: (notifications: AppNotification[]) => void;
  pushNotification: (notification: AppNotification) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsAsRead: () => void;
  setNotificationReadStorageKey: (storageKey: string | null) => void;
};

function readPersistedReadNotificationIds(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return new Set<string>();

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return new Set<string>();

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return new Set<string>();

    return new Set(
      parsedValue.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

function writePersistedReadNotificationIds(
  storageKey: string | null,
  notificationIds: Iterable<string>,
) {
  if (!storageKey || typeof window === "undefined") return;

  try {
    const readIds = Array.from(new Set(notificationIds)).slice(
      -MAX_PERSISTED_READ_NOTIFICATION_IDS,
    );
    window.localStorage.setItem(storageKey, JSON.stringify(readIds));
  } catch {
    // Ignore storage quota or privacy-mode failures; in-memory read state still applies.
  }
}

function persistReadNotificationIds(
  storageKey: string | null,
  notificationIds: Iterable<string>,
) {
  if (!storageKey) return;

  const persistedIds = readPersistedReadNotificationIds(storageKey);
  for (const notificationId of notificationIds) {
    persistedIds.add(notificationId);
  }
  writePersistedReadNotificationIds(storageKey, persistedIds);
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  notifications: [],
  notificationReadStorageKey: null,
  isMessagesOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleMessages: () =>
    set((state) => ({ isMessagesOpen: !state.isMessagesOpen })),
  closeMessages: () => set({ isMessagesOpen: false }),
  openMessages: () => set({ isMessagesOpen: true }),
  clearNotifications: () => set({ notifications: [] }),
  setNotifications: (notifications) =>
    set((state) => {
      const persistedReadIds = readPersistedReadNotificationIds(
        state.notificationReadStorageKey,
      );
      const existingById = new Map(
        state.notifications.map((notification) => [
          notification.id,
          notification,
        ]),
      );

      return {
        notifications: notifications
          .map((notification) => {
            const existingNotification = existingById.get(notification.id);
            const wasReadPreviously =
              existingNotification?.unread === false ||
              persistedReadIds.has(notification.id);

            return wasReadPreviously
              ? { ...notification, unread: false }
              : notification;
          })
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          .slice(0, 100),
      };
    }),
  pushNotification: (notification) =>
    set((state) => {
      const persistedReadIds = readPersistedReadNotificationIds(
        state.notificationReadStorageKey,
      );
      const existingNotifications = state.notifications.filter(
        (item) => item.id !== notification.id,
      );
      const nextNotification = persistedReadIds.has(notification.id)
        ? { ...notification, unread: false }
        : notification;
      return {
        notifications: [nextNotification, ...existingNotifications].slice(
          0,
          100,
        ),
      };
    }),
  markNotificationAsRead: (notificationId) =>
    set((state) => {
      persistReadNotificationIds(state.notificationReadStorageKey, [
        notificationId,
      ]);

      return {
        notifications: state.notifications.map((notification) =>
          notification.id === notificationId
            ? { ...notification, unread: false }
            : notification,
        ),
      };
    }),
  markAllNotificationsAsRead: () =>
    set((state) => {
      persistReadNotificationIds(
        state.notificationReadStorageKey,
        state.notifications.map((notification) => notification.id),
      );

      return {
        notifications: state.notifications.map((notification) => ({
          ...notification,
          unread: false,
        })),
      };
    }),
  setNotificationReadStorageKey: (storageKey) =>
    set((state) => {
      const persistedReadIds = readPersistedReadNotificationIds(storageKey);

      return {
        notificationReadStorageKey: storageKey,
        notifications: state.notifications.map((notification) =>
          persistedReadIds.has(notification.id)
            ? { ...notification, unread: false }
            : notification,
        ),
      };
    }),
}));
