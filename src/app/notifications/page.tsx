"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Heart,
  MapPin,
  MessageCircleMore,
  MessagesSquare,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppNotificationType, useUIStore } from "@/stores/ui-store";
import layoutStyles from "../page.module.css";
import styles from "./notifications.module.css";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(timestamp: string) {
  const diffMs = new Date(timestamp).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) return relativeTimeFormatter.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) return relativeTimeFormatter.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  return relativeTimeFormatter.format(diffDays, "day");
}

function getTypeIcon(type: AppNotificationType) {
  if (type === "post-like" || type === "gallery-like") return <Heart size={16} aria-hidden />;
  if (type === "post-comment" || type === "general-message") return <MessageCircleMore size={16} aria-hidden />;
  if (type === "video-visitor") return <Users size={16} aria-hidden />;
  if (type === "map-entry") return <MapPin size={16} aria-hidden />;
  if (type === "friend-request") return <UserPlus size={16} aria-hidden />;
  if (type === "admin-report" || type === "admin-registration") return <ShieldAlert size={16} aria-hidden />;
  return <MessagesSquare size={16} aria-hidden />;
}

export default function NotificationsPage() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const notifications = useUIStore((state) => state.notifications);
  const markNotificationAsRead = useUIStore((state) => state.markNotificationAsRead);
  const markAllNotificationsAsRead = useUIStore((state) => state.markAllNotificationsAsRead);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  const visibleNotifications = useMemo(
    () => (showUnreadOnly ? notifications.filter((notification) => notification.unread) : notifications),
    [notifications, showUnreadOnly],
  );

  return (
    <div className={layoutStyles.shell}>
      <AppSidebar />

      <main className={layoutStyles.content}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>Realtime updates for likes, comments, rooms, map entries, admin alerts, and friend requests.</p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.filterButton}
              onClick={() => setShowUnreadOnly((current) => !current)}
              aria-pressed={showUnreadOnly}
            >
              {showUnreadOnly ? "Show all" : "Unread only"}
            </button>

            <button type="button" className={styles.markButton} onClick={markAllNotificationsAsRead} disabled={unreadCount === 0}>
              <CheckCheck size={16} aria-hidden />
              Mark all as read
            </button>
          </div>
        </div>

        <Card className={styles.summaryCard}>
          <CardHeader>
            <CardTitle className={styles.summaryTitle}>
              <Bell size={18} aria-hidden />
              Inbox status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={styles.summaryText}>
              You have <strong>{unreadCount}</strong> unread {unreadCount === 1 ? "notification" : "notifications"}.
            </p>
          </CardContent>
        </Card>

        <section className={styles.list} aria-label="Notification list">
          {visibleNotifications.length ? (
            visibleNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`${styles.notification} ${notification.unread ? styles.unread : ""}`}
                aria-live="polite"
              >
                <div className={styles.iconWrap}>{getTypeIcon(notification.type)}</div>

                <div className={styles.body}>
                  <div className={styles.topRow}>
                    <h2>{notification.title}</h2>
                    <span>{formatRelativeTime(notification.timestamp)}</span>
                  </div>
                  <p>{notification.detail}</p>
                </div>

                <div className={styles.meta}>
                  {notification.unread ? <Badge className={styles.unreadBadge}>Unread</Badge> : <Badge>Read</Badge>}
                  <button type="button" onClick={() => markNotificationAsRead(notification.id)} className={styles.toggleButton}>
                    Mark as read
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Card>
              <CardContent className={styles.emptyState}>
                You are all caught up. No unread notifications right now.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}