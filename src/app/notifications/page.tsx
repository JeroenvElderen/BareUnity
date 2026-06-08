import { useEffect, useMemo, useState } from "react";
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

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Badge } from "@/components/ui/badge";

type AppNotificationType =
  | "post-like"
  | "gallery-like"
  | "post-comment"
  | "general-message"
  | "video-visitor"
  | "map-entry"
  | "admin-location"
  | "admin-report"
  | "admin-registration"
  | "admin-feedback"
  | "friend-request"
  | "admin-verification";

interface NotificationRecord {
  id: string;
  type: AppNotificationType;
  title: string;
  detail: string;
  target_href: string | null;
  unread: boolean;
  created_at: string;
  read_at: string | null;
}
import layoutStyles from "../page.module.css";
import styles from "./notifications.module.css";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelativeTime(timestamp: string) {
  const diffMs = new Date(timestamp).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60)
    return relativeTimeFormatter.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48)
    return relativeTimeFormatter.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  return relativeTimeFormatter.format(diffDays, "day");
}

function getTypeIcon(type: AppNotificationType) {
  if (type === "post-like" || type === "gallery-like")
    return <Heart size={16} aria-hidden />;
  if (type === "post-comment" || type === "general-message")
    return <MessageCircleMore size={16} aria-hidden />;
  if (type === "video-visitor") return <Users size={16} aria-hidden />;
  if (type === "map-entry" || type === "admin-location")
    return <MapPin size={16} aria-hidden />;
  if (type === "friend-request") return <UserPlus size={16} aria-hidden />;
  if (
    type === "admin-report" ||
    type === "admin-registration" ||
    type === "admin-feedback" ||
    type === "admin-verification"
  )
    return <ShieldAlert size={16} aria-hidden />;
  return <MessagesSquare size={16} aria-hidden />;
}

export default function NotificationsPage() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [notificationItems, setNotificationItems] = useState<
  NotificationRecord[]
>([]);

useEffect(() => {
  async function loadNotifications() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setNotificationItems(data ?? []);
  }

  loadNotifications();
}, []);

async function markNotificationAsRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({
      unread: false,
      read_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(error);
    return;
  }

  setNotificationItems((current) =>
    current.map((notification) =>
      notification.id === id
        ? { ...notification, unread: false }
        : notification
    )
  );
}

async function markAllNotificationsAsRead() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({
      unread: false,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("unread", true);

  if (error) {
    console.error(error);
    return;
  }

  setNotificationItems((current) =>
    current.map((notification) => ({
      ...notification,
      unread: false,
    }))
  );
}

  const unreadCount = useMemo(
    () =>
      notificationItems.filter((notification) => notification.unread).length,
    [notificationItems],
  );

  const readCount = notificationItems.length - unreadCount;

  const visibleNotifications = useMemo(
    () =>
      showUnreadOnly
        ? notificationItems.filter((notification) => notification.unread)
        : notificationItems,
    [notificationItems, showUnreadOnly],
  );

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Stay in sync</p>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.subtitle}>
              A cleaner inbox designed to match the rest of your platform:
              likes, comments, messages, room activity, map entries, and admin
              alerts in one stream.
            </p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.filterButton}
              onClick={() => setShowUnreadOnly((current) => !current)}
              aria-pressed={showUnreadOnly}
            >
              {showUnreadOnly ? "Showing unread" : "All notifications"}
            </button>

            <button
              type="button"
              className={styles.markButton}
              onClick={markAllNotificationsAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={16} aria-hidden />
              Mark all as read
            </button>
          </div>
        </section>

        <section className={styles.stats} aria-label="Notification statistics">
          <article className={styles.statCard}>
            <span>Total</span>
            <strong>{notificationItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Unread</span>
            <strong>{unreadCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Read</span>
            <strong>{readCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Status</span>
            <strong className={styles.statusText}>
              <Bell size={16} aria-hidden />
              {unreadCount === 0 ? "All caught up" : "Needs review"}
            </strong>
          </article>
        </section>

        <section className={styles.list} aria-label="Notification list">
          {visibleNotifications.length ? (
            visibleNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`${styles.notification} ${notification.unread ? styles.unread : ""}`}
                aria-live="polite"
              >
                <div className={styles.iconWrap}>
                  {getTypeIcon(notification.type)}
                </div>

                <div className={styles.body}>
                  <div className={styles.topRow}>
                    <h2>{notification.title}</h2>
                    <span>{formatRelativeTime(notification.created_at)}</span>
                  </div>
                  <p>{notification.detail}</p>
                </div>

                <div className={styles.meta}>
                  {notification.unread ? (
                    <Badge className={styles.unreadBadge}>Unread</Badge>
                  ) : (
                    <Badge>Read</Badge>
                  )}
                  <div className={styles.ctaWrap}>
                    {notification.target_href ? (
                      <Link
                        href={notification.target_href}
                        className={styles.toggleButton}
                      >
                        Open
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => markNotificationAsRead(notification.id)}
                      className={styles.toggleButton}
                    >
                      Mark as read
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <article className={styles.emptyState}>
              <h2>Inbox clear</h2>
              <p>You are all caught up. No unread notifications right now.</p>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
