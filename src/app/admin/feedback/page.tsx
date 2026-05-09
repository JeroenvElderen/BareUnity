"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type FeedbackMessage = {
  id: string;
  category: "bug" | "idea" | "question" | "other";
  message: string;
  status: string | null;
  page_url: string | null;
  user_agent: string | null;
  user_email: string | null;
  user_id: string | null;
  created_at: string;
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function categoryLabel(category: FeedbackMessage["category"]) {
  return {
    bug: "Bug",
    idea: "Idea",
    question: "Question",
    other: "Other",
  }[category];
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFeedback = useCallback(async () => {
    setError("");
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Please sign in first. We could not verify your admin session.");
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/admin/feedback", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = (await response.json()) as { feedback?: FeedbackMessage[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Could not load feedback.");
      setIsLoading(false);
      return;
    }

    setFeedback(payload.feedback ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadFeedback();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadFeedback]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>🌿 BareUnity • Admin Studio</p>
            <h1 className={styles.title}>User Feedback Inbox</h1>
            <p className={styles.subtitle}>Read ideas, bugs, and questions submitted from the floating feedback bubble.</p>
          </div>
          <button className={styles.refreshButton} onClick={() => void loadFeedback()}>Refresh</button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isLoading ? (
          <p className={styles.empty}>Loading feedback…</p>
        ) : feedback.length === 0 ? (
          <p className={styles.empty}>No feedback has been submitted yet.</p>
        ) : (
          <div className={styles.list}>
            {feedback.map((item) => (
              <article key={item.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.category}>{categoryLabel(item.category)}</span>
                    <strong>{item.user_email || "Unknown member"}</strong>
                  </div>
                  <span>{prettyDate(item.created_at)}</span>
                </div>
                <p className={styles.message}>{item.message}</p>
                <dl className={styles.metaGrid}>
                  <div>
                    <dt>Status</dt>
                    <dd>{item.status || "new"}</dd>
                  </div>
                  <div>
                    <dt>Page</dt>
                    <dd>{item.page_url ? <a href={item.page_url}>{item.page_url}</a> : "Not captured"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}