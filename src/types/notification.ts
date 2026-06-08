export type NotificationType =
  | "post-like"
  | "gallery-like"
  | "post-comment"
  | "admin-report"
  | "admin-registration"
  | "admin-feedback"
  | "admin-verification"
  | "map-entry"
  | "admin-location";

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  detail: string;
  target_href: string | null;
  unread: boolean;
  created_at: string;
}