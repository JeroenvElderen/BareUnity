"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type Report = {
  id: string;
  reason: string | null;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  profiles: { id: string; username: string | null; display_name: string | null } | null;
  posts: { id: string; title: string | null; content: string | null } | null;
  comments: { id: string; content: string | null } | null;
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setError("");
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Please sign in first. We could not verify your admin session.");
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/admin/reports", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = (await response.json()) as { reports?: Report[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Could not load reports.");
      setIsLoading(false);
      return;
    }

    setReports(payload.reports ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadReports();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadReports]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>🌿 BareUnity • Admin Studio</p>
            <h1 className={styles.title}>Flagged Content Queue</h1>
            <p className={styles.subtitle}>Review member reports for posts and comments in one place.</p>
          </div>
          <button className={styles.refreshButton} onClick={() => void loadReports()}>Refresh</button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isLoading ? (
          <p className={styles.empty}>Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className={styles.empty}>No flagged content right now.</p>
        ) : (
          <div className={styles.list}>
            {reports.map((report) => (
              <article key={report.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <strong>{report.comment_id ? "Comment report" : "Post report"}</strong>
                  <span>{prettyDate(report.created_at)}</span>
                </div>
                <p className={styles.reason}>Reason: {report.reason || "No reason provided"}</p>
                <p className={styles.meta}>
                  Reporter: {report.profiles?.display_name || report.profiles?.username || "Unknown"}
                </p>
                {report.posts ? <p className={styles.content}>Post: {report.posts.title || report.posts.content || "Untitled post"}</p> : null}
                {report.comments ? <p className={styles.content}>Comment: {report.comments.content || "Empty comment"}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}