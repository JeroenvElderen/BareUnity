"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type UserDetailsPayload = {
  user: {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
    phone?: string | null;
    role?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
  profile: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  verification: Record<string, unknown> | null;
  posts: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
};

function formatDate(value: unknown) {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US");
}

function toRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function valueToString(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && value.includes("T") && value.includes(":")) return formatDate(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function KeyValueCard({
  title,
  value,
  fields,
}: {
  title: string;
  value: Record<string, unknown> | null;
  fields?: Array<{ key: string; label: string }>;
}) {
  const entries = fields?.length
    ? fields.map(({ key, label }) => ({ label, value: value?.[key] }))
    : Object.entries(value ?? {}).map(([key, entryValue]) => ({ label: key.replace(/_/g, " "), value: entryValue }));

  return (
    <article className={styles.card}>
      <h2>{title}</h2>
      {!entries.length ? (
        <p className={styles.emptyState}>No data available.</p>
      ) : (
        <dl className={styles.dataList}>
          {entries.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{valueToString(entry.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function ActivityCard({
  title,
  items,
  primaryField,
  secondaryField,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  primaryField: string;
  secondaryField: string;
}) {
  return (
    <article className={styles.card}>
      <h2>{title}</h2>
      {!items.length ? (
        <p className={styles.emptyState}>No items yet.</p>
      ) : (
        <ul className={styles.activityList}>
          {items.map((item) => (
            <li key={String(item.id ?? `${item[primaryField]}-${item.created_at}`)}>
              <div>
                <p className={styles.activityPrimary}>{valueToString(item[primaryField])}</p>
                <p className={styles.activitySecondary}>{valueToString(item[secondaryField])}</p>
              </div>
              <span>{formatDate(item.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [details, setDetails] = useState<UserDetailsPayload | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError("");

      const resolved = await params;
      if (!active) return;
      setUserId(resolved.userId);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        if (active) {
          setError("Please sign in first. We could not verify your admin session.");
          setIsLoading(false);
        }
        return;
      }

      const response = await fetch(`/api/admin/users/${resolved.userId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as UserDetailsPayload & { error?: string };
      if (!response.ok) {
        if (active) {
          setError(payload.error ?? "Could not load user details.");
          setIsLoading(false);
        }
        return;
      }

      if (active) {
        setDetails(payload);
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [params]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <Link href="/admin/users" className={styles.backLink}>
          ← Back to user admin
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Owner-only Full User Admin</p>
          <h1>{userId ? `User ${userId}` : "User details"}</h1>
          {details?.user ? (
            <p>
              Email: {details.user.email || "—"} • Created: {formatDate(details.user.created_at)} • Last sign-in:{" "}
              {formatDate(details.user.last_sign_in_at)}
            </p>
          ) : null}
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {isLoading ? <p className={styles.loading}>Loading user profile…</p> : null}

        {details ? (
          <section className={styles.grid}>
            <KeyValueCard
              title="Auth account"
              value={toRecord(details.user)}
              fields={[
                { key: "id", label: "User ID" },
                { key: "email", label: "Email" },
                { key: "role", label: "Role" },
                { key: "phone", label: "Phone" },
                { key: "email_confirmed_at", label: "Email confirmed" },
                { key: "created_at", label: "Created at" },
                { key: "last_sign_in_at", label: "Last sign in" },
              ]}
            />
            <KeyValueCard
              title="Profile"
              value={toRecord(details.profile)}
              fields={[
                { key: "username", label: "Username" },
                { key: "display_name", label: "Display name" },
                { key: "bio", label: "Bio" },
                { key: "location", label: "Location" },
                { key: "avatar_url", label: "Avatar URL" },
                { key: "created_at", label: "Profile created" },
              ]}
            />
            <KeyValueCard title="Profile settings" value={toRecord(details.settings)} />
            <KeyValueCard title="Verification" value={toRecord(details.verification)} />
            <KeyValueCard title="Metrics" value={toRecord(details.metrics)} />
            <ActivityCard title="Latest posts" items={details.posts} primaryField="title" secondaryField="content" />
            <ActivityCard title="Latest comments" items={details.comments} primaryField="content" secondaryField="post_id" />
            <ActivityCard title="Reports submitted" items={details.reports} primaryField="reason" secondaryField="target_type" />
          </section>
        ) : null}
      </section>
    </main>
  );
}