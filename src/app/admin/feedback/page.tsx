"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type FeedbackReply = {
  id: string;
  feedback_id: string;
  author_id: string | null;
  author_email: string | null;
  author_role: "member" | "admin";
  message: string;
  created_at: string;
};

type FeedbackStatus = "new" | "reviewing" | "done" | "dismissed";

type FeedbackMessage = {
  id: string;
  category: "bug" | "idea" | "question" | "other";
  message: string;
  status:
    | FeedbackStatus
    | "open"
    | "awaiting_admin"
    | "answered"
    | "closed"
    | string
    | null;
  page_url: string | null;
  user_agent: string | null;
  user_email: string | null;
  user_id: string | null;
  created_at: string;
  replies: FeedbackReply[];
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

function categoryLabel(category: FeedbackMessage["category"]) {
  return {
    bug: "Bug",
    idea: "Idea",
    question: "Question",
    other: "Other",
  }[category];
}

function statusLabel(status: FeedbackMessage["status"]) {
  return (
    {
      new: "Open",
      reviewing: "Needs admin reply",
      done: "Answered",
      dismissed: "Closed",
      open: "Open",
      awaiting_admin: "Needs admin reply",
      answered: "Answered",
      closed: "Closed",
    }[status ?? "open"] ??
    status ??
    "Open"
  );
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const selectedTicket = useMemo(
    () =>
      feedback.find((item) => item.id === selectedId) ?? feedback[0] ?? null,
    [feedback, selectedId],
  );

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Please sign in first. We could not verify your admin session.");
      return null;
    }

    return session.access_token;
  }, []);

  const loadFeedback = useCallback(async () => {
    setError("");
    setIsLoading(true);

    const token = await getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    const response = await fetch("/api/admin/feedback", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = (await response.json()) as {
      feedback?: FeedbackMessage[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Could not load feedback.");
      setIsLoading(false);
      return;
    }

    const nextFeedback = payload.feedback ?? [];
    setFeedback(nextFeedback);
    setSelectedId((current) => current ?? nextFeedback[0]?.id ?? null);
    setIsLoading(false);
  }, [getToken]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadFeedback();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadFeedback]);

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;

    setError("");
    setIsSending(true);
    const token = await getToken();
    if (!token) {
      setIsSending(false);
      return;
    }

    const response = await fetch(
      `/api/admin/feedback/${selectedTicket.id}/replies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyMessage }),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      reply?: FeedbackReply;
      error?: string;
    };
    if (!response.ok || !payload.reply) {
      setError(payload.error ?? "Could not send your reply.");
      setIsSending(false);
      return;
    }

    setFeedback((current) =>
      current.map((item) =>
        item.id === selectedTicket.id
          ? {
              ...item,
              status: "done",
              replies: [...item.replies, payload.reply!],
            }
          : item,
      ),
    );
    setReplyMessage("");
    setIsSending(false);
  };

  const updateStatus = async (status: FeedbackStatus) => {
    if (!selectedTicket) return;

    setError("");
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`/api/admin/feedback/${selectedTicket.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      feedback?: { status: FeedbackMessage["status"] };
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Could not update ticket status.");
      return;
    }

    setFeedback((current) =>
      current.map((item) =>
        item.id === selectedTicket.id
          ? { ...item, status: payload.feedback?.status ?? status }
          : item,
      ),
    );
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>🌿 BareUnity • Admin Studio</p>
            <h1 className={styles.title}>Feedback Ticket Inbox</h1>
            <p className={styles.subtitle}>
              Discuss ideas, bugs, and questions with members in an ongoing
              ticket thread.
            </p>
          </div>
          <button
            className={styles.refreshButton}
            onClick={() => void loadFeedback()}
          >
            Refresh
          </button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isLoading ? (
          <p className={styles.empty}>Loading feedback…</p>
        ) : feedback.length === 0 ? (
          <p className={styles.empty}>No feedback has been submitted yet.</p>
        ) : (
          <div className={styles.ticketDesk}>
            <aside className={styles.list} aria-label="Feedback tickets">
              {feedback.map((item) => (
                <button
                  key={item.id}
                  className={styles.card}
                  data-selected={selectedTicket?.id === item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className={styles.cardHeader}>
                    <div>
                      <span className={styles.category}>
                        {categoryLabel(item.category)}
                      </span>
                      <strong>{item.user_email || "Unknown member"}</strong>
                    </div>
                    <span>{prettyDate(item.created_at)}</span>
                  </div>
                  <p className={styles.message}>{item.message}</p>
                  <span className={styles.statusPill}>
                    {statusLabel(item.status)}
                  </span>
                </button>
              ))}
            </aside>

            {selectedTicket ? (
              <article className={styles.threadCard}>
                <div className={styles.threadHeader}>
                  <div>
                    <span className={styles.category}>
                      {categoryLabel(selectedTicket.category)}
                    </span>
                    <h2>{selectedTicket.user_email || "Unknown member"}</h2>
                    <p>
                      Opened {prettyDate(selectedTicket.created_at)} •{" "}
                      {statusLabel(selectedTicket.status)}
                    </p>
                  </div>
                  <div className={styles.statusActions}>
                    <button
                      type="button"
                      onClick={() => void updateStatus("new")}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus("reviewing")}
                    >
                      Needs reply
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus("dismissed")}
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className={styles.threadMessages}>
                  <section className={styles.chatBubble} data-author="member">
                    <span>{selectedTicket.user_email || "Member"}</span>
                    <p>{selectedTicket.message}</p>
                    <small>{prettyDate(selectedTicket.created_at)}</small>
                  </section>
                  {selectedTicket.replies.map((reply) => (
                    <section
                      key={reply.id}
                      className={styles.chatBubble}
                      data-author={reply.author_role}
                    >
                      <span>
                        {reply.author_role === "admin"
                          ? "BareUnity team"
                          : reply.author_email || "Member"}
                      </span>
                      <p>{reply.message}</p>
                      <small>{prettyDate(reply.created_at)}</small>
                    </section>
                  ))}
                </div>

                <form className={styles.replyForm} onSubmit={sendReply}>
                  <label htmlFor="admin-feedback-reply">
                    Reply to this member
                  </label>
                  <textarea
                    id="admin-feedback-reply"
                    value={replyMessage}
                    onChange={(event) => setReplyMessage(event.target.value)}
                    placeholder="Ask a follow-up question, share a workaround, or confirm that this has been handled…"
                    maxLength={1200}
                    required
                  />
                  <div className={styles.replyFooter}>
                    <span>{replyMessage.length}/1200 characters</span>
                    <button
                      className={styles.refreshButton}
                      type="submit"
                      disabled={isSending || replyMessage.trim().length < 2}
                    >
                      {isSending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </form>

                <dl className={styles.metaGrid}>
                  <div>
                    <dt>Page</dt>
                    <dd>
                      {selectedTicket.page_url ? (
                        <a href={selectedTicket.page_url}>
                          {selectedTicket.page_url}
                        </a>
                      ) : (
                        "Not captured"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>User agent</dt>
                    <dd>{selectedTicket.user_agent || "Not captured"}</dd>
                  </div>
                </dl>
              </article>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
