"use client";

import { useMemo, useState } from "react";
import { Bell, CalendarDays, CheckCheck, CircleAlert, MessageCircleMore, ShieldAlert } from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import layoutStyles from "../page.module.css";
import styles from "./notifications.module.css";

type NotificationType = "security" | "message" | "booking" | "event";

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  when: string;
  type: NotificationType;
  unread: boolean;
};

const seedNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "New login detected",
    detail: "We noticed a sign in from a new device in Austin, TX.",
    when: "2 min ago",
    type: "security",
    unread: true,
  },
  {
    id: "notif-2",
    title: "You were mentioned in Naturist Photography",
    detail: "@lina tagged you in a thread about beach sunrise settings.",
    when: "15 min ago",
    type: "message",
    unread: true,
  },
  {
    id: "notif-3",
    title: "Retreat booking updated",
    detail: "Your check-in for Calm Coast Retreat moved to 4:00 PM.",
    when: "1 hour ago",
    type: "booking",
    unread: false,
  },
  {
    id: "notif-4",
    title: "Reminder: Community wellness circle",
    detail: "Starts tomorrow at 8:30 AM. Bring your water bottle and mat.",
    when: "3 hours ago",
    type: "event",
    unread: false,
  },
];

function getTypeIcon(type: NotificationType) {
  if (type === "security") return <ShieldAlert size={16} aria-hidden />;
  if (type === "message") return <MessageCircleMore size={16} aria-hidden />;
  if (type === "booking") return <CircleAlert size={16} aria-hidden />;
  return <CalendarDays size={16} aria-hidden />;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(seedNotifications);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  const visibleNotifications = useMemo(
    () => (showUnreadOnly ? notifications.filter((notification) => notification.unread) : notifications),
    [notifications, showUnreadOnly],
  );

  const markAllAsRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })));
  };

  const toggleNotificationRead = (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, unread: !notification.unread } : notification,
      ),
    );
  };

  return (
    <div className={layoutStyles.shell}>
      <AppSidebar />

      <main className={layoutStyles.content}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>Security, mentions, bookings, and event reminders in one place.</p>
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

            <button type="button" className={styles.markButton} onClick={markAllAsRead} disabled={unreadCount === 0}>
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
                    <span>{notification.when}</span>
                  </div>
                  <p>{notification.detail}</p>
                </div>

                <div className={styles.meta}>
                  {notification.unread ? <Badge className={styles.unreadBadge}>Unread</Badge> : <Badge>Read</Badge>}
                  <button type="button" onClick={() => toggleNotificationRead(notification.id)} className={styles.toggleButton}>
                    Mark as {notification.unread ? "read" : "unread"}
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