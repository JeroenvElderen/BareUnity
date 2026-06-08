"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Notification {
  id: string;
  title: string;
  detail: string;
  unread: boolean;
  created_at: string;
}

export default function TestNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

      setNotifications(data ?? []);
    }

    loadNotifications();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Notifications</h1>

      {notifications.map((notification) => (
        <div
          key={notification.id}
          style={{
            marginBottom: 12,
            padding: 12,
            border: "1px solid #ccc",
          }}
        >
          <strong>{notification.title}</strong>
          <p>{notification.detail}</p>
        </div>
      ))}
    </div>
  );
}