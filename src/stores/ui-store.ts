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
  notificationsBootstrapped: boolean;
  toggleSidebar: () => void;
  bootstrapNotifications: (notifications: AppNotification[]) => void;
  pushNotification: (notification: AppNotification) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsAsRead: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  notifications: [],
  notificationsBootstrapped: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
bootstrapNotifications: (notifications) =>
    set((state) => {
      if (state.notificationsBootstrapped) return state;
      return { notifications, notificationsBootstrapped: true };
    }),
  pushNotification: (notification) =>
    set((state) => ({ notifications: [notification, ...state.notifications].slice(0, 100) })),
  markNotificationAsRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, unread: false } : notification,
      ),
    })),
  markAllNotificationsAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, unread: false })),
    })),
}));