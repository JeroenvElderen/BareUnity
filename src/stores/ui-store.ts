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

type UIState = {
  sidebarOpen: boolean;
  notifications: AppNotification[];
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
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  notifications: [],
  isMessagesOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleMessages: () =>
    set((state) => ({ isMessagesOpen: !state.isMessagesOpen })),
  closeMessages: () => set({ isMessagesOpen: false }),
  openMessages: () => set({ isMessagesOpen: true }),
  clearNotifications: () => set({ notifications: [] }),
  setNotifications: (notifications) =>
    set((state) => {
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
            return existingNotification
              ? { ...notification, unread: existingNotification.unread }
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
      const existingNotifications = state.notifications.filter(
        (item) => item.id !== notification.id,
      );
      return {
        notifications: [notification, ...existingNotifications].slice(0, 100),
      };
    }),
  markNotificationAsRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, unread: false }
          : notification,
      ),
    })),
  markAllNotificationsAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({
        ...notification,
        unread: false,
      })),
    })),
}));
