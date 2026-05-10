"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type ProfileSummary = { id: string; username: string | null; display_name: string | null };

type Report = {
  id: string;
  reason: string | null;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  target_type: string | null;
  target_id: string | null;
  profiles: ProfileSummary | null;
  posts: { id: string; title: string | null; content: string | null; media_url: string | null; post_type: string | null; author_id: string | null } | null;
  comments: { id: string; content: string | null; author_id: string | null } | null;
  target_profile: ProfileSummary | null;
  post_author_profile: ProfileSummary | null;
  comment_author_profile: ProfileSummary | null;
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function profileName(profile: ProfileSummary | null | undefined) {
  return profile?.display_name?.trim() || profile?.username || "Unknown";
}

function reportLabel(report: Report) {
  const targetType = report.target_type || (report.comment_id ? "comment" : report.post_id ? "post" : "other");
  if (targetType === "story") return "Story report";
  if (targetType === "user") return "Member report";
  if (targetType === "media") return "Media report";
  if (targetType === "message") return "Message report";
  if (targetType === "map_spot") return "Map spot report";
  if (targetType === "comment") return "Comment report";
  if (targetType === "post") return "Post report";
  return "Report";
}

function targetSummary(report: Report) {
  if (report.target_type === "user") return `Member: ${profileName(report.target_profile)}`;
  if (report.target_type === "media") return `Media path: ${report.target_id || "Unknown media"}`;
  if (report.target_type === "message") return `Message ID: ${report.target_id || "Unknown message"}`;
  if (report.target_type === "map_spot") return `Map spot ID: ${report.target_id || "Unknown spot"}`;
  if (report.comments) return `Comment by ${profileName(report.comment_author_profile)}: ${report.comments.content || "Empty comment"}`;
  if (report.posts) {
    const postType = report.target_type === "story" || report.posts.post_type === "story" ? "Story" : "Post";
    const text = report.posts.title || report.posts.content || report.posts.media_url || "Untitled post";
    return `${postType} by ${profileName(report.post_author_profile)}: ${text}`;
  }
  return `Target: ${report.target_type || "other"}${report.target_id ? ` · ${report.target_id}` : ""}`;
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
            <h1 className={styles.title}>Reports Queue</h1>
            <p className={styles.subtitle}>Review member reports for posts, comments, profiles, stories, and gallery media in one place.</p>
          </div>
          <button className={styles.refreshButton} onClick={() => void loadReports()}>Refresh</button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isLoading ? (
          <p className={styles.empty}>Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className={styles.empty}>No reports right now.</p>
        ) : (
          <div className={styles.list}>
            {reports.map((report) => (
              <article key={report.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{reportLabel(report)}</strong>
                    <p className={styles.targetType}>{report.target_type || "legacy"}</p>
                  </div>
                  <span>{prettyDate(report.created_at)}</span>
                </div>
                <p className={styles.reason}>Reason: {report.reason || "No reason provided"}</p>
                <p className={styles.meta}>Reporter: {profileName(report.profiles)}</p>
                <p className={styles.content}>{targetSummary(report)}</p>
                {report.posts?.media_url ? <p className={styles.mediaUrl}>Media URL: {report.posts.media_url}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}