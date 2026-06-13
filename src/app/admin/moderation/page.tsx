"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type QueueItem = {
  imagePath: string;
  title: string;
  username: string;
  createdAt: string;
  src: string;
  galleryType: string;
  moderationStatus: string;
  moderationConfidence: number;
  moderationReason: string;
  reportCount: number;
  metadata: Record<string, boolean>;
};

type Stats = {
  totalUploads: number;
  approvedNude: number;
  approvedGeneral: number;
  pendingReview: number;
  rejected: number;
  averageModerationConfidence: number;
  mostReportedImages: Array<{ imagePath: string; reportCount: number }>;
};

const EMPTY_STATS: Stats = {
  totalUploads: 0,
  approvedNude: 0,
  approvedGeneral: 0,
  pendingReview: 0,
  rejected: 0,
  averageModerationConfidence: 0,
  mostReportedImages: [],
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metadataLabel(metadata: Record<string, boolean>) {
  return (
    Object.entries(metadata)
      .filter(([, value]) => value)
      .map(([key]) => key.replace(/^contains/, ""))
      .join(", ") || "No positive classifier labels"
  );
}

export default function AdminModerationPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token)
        throw new Error(
          "Please sign in first. We could not verify your admin session.",
        );

      return fetch(input, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    },
    [],
  );

  const loadQueue = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await authenticatedFetch(
        "/api/admin/gallery-moderation",
      );
      const payload = (await response.json()) as {
        items?: QueueItem[];
        stats?: Stats;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Could not load moderation queue.");
      setItems(payload.items ?? []);
      setStats(payload.stats ?? EMPTY_STATS);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load moderation queue.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const runAction = async (action: string, imagePath?: string) => {
    setError("");
    setStatus("");
    setPendingPath(imagePath ?? "bulk");

    try {
      const response = await authenticatedFetch(
        "/api/admin/gallery-moderation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            imagePath,
            reason:
              action === "auto_classify_existing"
                ? "Bulk AI reclassification: nude people go to Nude Gallery, everything else goes to General Gallery."
                : "Manual moderator decision.",
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        reviewed?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Could not update moderation state.");
      setStatus(
        action === "auto_classify_existing"
          ? `Auto-classified ${payload.reviewed ?? 0} pending item(s): nude people moved to Nude Gallery, everything else moved to General Gallery.`
          : "Moderation decision saved.",
      );
      await loadQueue();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update moderation state.",
      );
    } finally {
      setPendingPath(null);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>🌿 BareUnity • Gallery Moderation</p>
            <h1 className={styles.title}>Pending Review</h1>
            <p className={styles.subtitle}>
              Review low-confidence, reported, and newly migrated gallery media
              before anything returns to a public gallery.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => void runAction("auto_classify_existing")}
              disabled={pendingPath !== null}
            >
              Auto sort galleries
            </button>
            <button onClick={() => void loadQueue()} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.status}>{status}</p> : null}

        <section
          className={styles.statsGrid}
          aria-label="Moderation statistics"
        >
          <article>
            <strong>{stats.totalUploads}</strong>
            <span>Total uploads</span>
          </article>
          <article>
            <strong>{stats.approvedNude}</strong>
            <span>Approved nude</span>
          </article>
          <article>
            <strong>{stats.approvedGeneral}</strong>
            <span>Approved general</span>
          </article>
          <article>
            <strong>{stats.pendingReview}</strong>
            <span>Pending review</span>
          </article>
          <article>
            <strong>{stats.rejected}</strong>
            <span>Rejected</span>
          </article>
          <article>
            <strong>{stats.averageModerationConfidence.toFixed(2)}</strong>
            <span>Avg confidence</span>
          </article>
        </section>

        {stats.mostReportedImages.length ? (
          <section className={styles.reportedBox}>
            <h2>Most reported images</h2>
            <ul>
              {stats.mostReportedImages.map((item) => (
                <li key={item.imagePath}>
                  {item.imagePath} · {item.reportCount} reports
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isLoading ? (
          <p className={styles.empty}>Loading pending media…</p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>The pending queue is clear.</p>
        ) : (
          <div className={styles.queue}>
            {items.map((item) => (
              <article key={item.imagePath} className={styles.card}>
                {item.src ? (
                  <img
                    src={item.src}
                    alt={item.title}
                    className={styles.preview}
                  />
                ) : (
                  <div className={styles.previewFallback}>
                    Preview unavailable
                  </div>
                )}
                <div className={styles.cardBody}>
                  <h2>{item.title}</h2>
                  <p className={styles.path}>{item.imagePath}</p>
                  <dl className={styles.details}>
                    <div>
                      <dt>Uploaded</dt>
                      <dd>{prettyDate(item.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>User</dt>
                      <dd>{item.username}</dd>
                    </div>
                    <div>
                      <dt>AI confidence</dt>
                      <dd>{item.moderationConfidence.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Reports</dt>
                      <dd>{item.reportCount}</dd>
                    </div>
                    <div>
                      <dt>Classification</dt>
                      <dd>{metadataLabel(item.metadata)}</dd>
                    </div>
                    <div>
                      <dt>Reason</dt>
                      <dd>{item.moderationReason}</dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    <button
                      onClick={() =>
                        void runAction("approve_nude", item.imagePath)
                      }
                      disabled={pendingPath !== null}
                    >
                      Approve Nude
                    </button>
                    <button
                      onClick={() =>
                        void runAction("approve_general", item.imagePath)
                      }
                      disabled={pendingPath !== null}
                    >
                      Approve General
                    </button>
                    <button
                      onClick={() => void runAction("reject", item.imagePath)}
                      disabled={pendingPath !== null}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
