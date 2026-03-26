"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type Application = {
  user_id: string;
  legal_name: string;
  display_name: string;
  date_of_birth: string;
  country: string;
  membership_type: string;
  id_type: string;
  status: string;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  idDocumentPath: string | null;
  idDocumentUrl: string | null;
};

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

function prettyDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminApplicationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setError("Please sign in first. We could not verify your admin session.");
      setIsLoading(false);
      return;
    }

    const email = session.user.email?.toLowerCase() ?? "";
    setAdminEmail(email);

    if (email !== ADMIN_EMAIL) {
      setError("This admin panel is restricted to your owner account.");
      setIsLoading(false);
      return;
    }

    const response = await fetch("/admin/verification-applications", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json()) as {
      applications?: Application[];
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Could not load applications.");
      setIsLoading(false);
      return;
    }

    setApplications(payload.applications ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadApplications();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadApplications]);

  const filteredApplications = useMemo(
    () => applications.filter((entry) => (statusFilter === "all" ? true : entry.status === statusFilter)),
    [applications, statusFilter],
  );

  async function submitDecision(userId: string, decision: "approved" | "rejected") {
    setIsReviewing(userId);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Session expired. Please sign in again.");
      setIsReviewing(null);
      return;
    }

    const response = await fetch(`/admin/verification-applications/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        decision,
        reviewerNote: reviewNotes[userId] ?? "",
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Unable to save the review decision.");
      setIsReviewing(null);
      return;
    }

    await loadApplications();
    setIsReviewing(null);
  }

  const counts = useMemo(
    () => ({
      all: applications.length,
      pending: applications.filter((entry) => entry.status === "pending").length,
      approved: applications.filter((entry) => entry.status === "approved").length,
      rejected: applications.filter((entry) => entry.status === "rejected").length,
    }),
    [applications],
  );

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>🌿 BareUnity • Admin Studio</p>
            <h1 className={styles.title}>Application Review Board</h1>
            <p className={styles.subtitle}>A calm, consent-first moderation workspace for strict onboarding approvals.</p>
          </div>
          <div className={styles.badge}>{adminEmail || "Not signed in"}</div>
        </header>

        <section className={styles.statsGrid}>
          <article className={styles.statCard}><span>All</span><strong>{counts.all}</strong></article>
          <article className={styles.statCard}><span>Pending</span><strong>{counts.pending}</strong></article>
          <article className={styles.statCard}><span>Approved</span><strong>{counts.approved}</strong></article>
          <article className={styles.statCard}><span>Rejected</span><strong>{counts.rejected}</strong></article>
        </section>

        <section className={styles.toolbar}>
          <label className={styles.filterLabel}>
            Status filter
            <select
              className={styles.select}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="pending">Pending</option>
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <button className={styles.refreshButton} onClick={() => void loadApplications()}>
            Refresh
          </button>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isLoading ? (
          <p className={styles.empty}>Loading applications…</p>
        ) : filteredApplications.length === 0 ? (
          <p className={styles.empty}>No applications for this filter yet.</p>
        ) : (
          <div className={styles.list}>
            {filteredApplications.map((application) => (
              <article key={application.user_id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2>{application.display_name}</h2>
                    <p>{application.legal_name}</p>
                  </div>
                  <span className={`${styles.statusChip} ${styles[`status${application.status}`] ?? ""}`}>
                    {application.status}
                  </span>
                </div>

                <dl className={styles.metaGrid}>
                  <div><dt>User ID</dt><dd>{application.user_id}</dd></div>
                  <div><dt>Country</dt><dd>{application.country}</dd></div>
                  <div><dt>Membership</dt><dd>{application.membership_type}</dd></div>
                  <div><dt>ID type</dt><dd>{application.id_type}</dd></div>
                  <div><dt>Birth date</dt><dd>{application.date_of_birth}</dd></div>
                  <div><dt>Applied</dt><dd>{prettyDate(application.created_at)}</dd></div>
                </dl>

                <div className={styles.documentRow}>
                  {application.idDocumentUrl ? (
                    <a className={styles.docLink} href={application.idDocumentUrl} target="_blank" rel="noreferrer">
                      Open uploaded ID document
                    </a>
                  ) : (
                    <p className={styles.docMissing}>No signed file URL available.</p>
                  )}
                </div>

                <label className={styles.noteLabel}>
                  Reviewer note
                  <textarea
                    className={styles.textarea}
                    value={reviewNotes[application.user_id] ?? ""}
                    onChange={(event) =>
                      setReviewNotes((prev) => ({
                        ...prev,
                        [application.user_id]: event.target.value,
                      }))
                    }
                    placeholder="Optional rationale for approve/reject"
                  />
                </label>

                <div className={styles.actions}>
                  <button
                    className={styles.approveButton}
                    onClick={() => void submitDecision(application.user_id, "approved")}
                    disabled={isReviewing === application.user_id}
                  >
                    {isReviewing === application.user_id ? "Saving..." : "Approve"}
                  </button>
                  <button
                    className={styles.rejectButton}
                    onClick={() => void submitDecision(application.user_id, "rejected")}
                    disabled={isReviewing === application.user_id}
                  >
                    {isReviewing === application.user_id ? "Saving..." : "Reject"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={styles.footerLink}>
          Need to test auth first? <Link href="/login">Go to login</Link>
        </p>
      </section>
    </main>
  );
}