"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bug, HelpCircle, Inbox, Lightbulb, MessageCircle, MoreHorizontal, Send, Sparkles, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import styles from "./feedback-bubble.module.css";

const categories = [
  { value: "idea", label: "Idea", description: "Share a feature or polish request.", Icon: Lightbulb },
  { value: "bug", label: "Bug", description: "Report something broken or confusing.", Icon: Bug },
  { value: "question", label: "Question", description: "Ask about BareUnity or your account.", Icon: HelpCircle },
  { value: "other", label: "Other", description: "Anything else we should know.", Icon: MoreHorizontal },
] as const;

type FeedbackState = "idle" | "sending" | "sent" | "error";
type TicketStatus = "open" | "awaiting_admin" | "answered" | "closed" | string;
type FeedbackTab = "new" | "tickets";

type FeedbackReply = {
  id: string;
  feedback_id: string;
  author_id: string | null;
  author_email: string | null;
  author_role: "member" | "admin";
  message: string;
  created_at: string;
};

type FeedbackTicket = {
  id: string;
  category: (typeof categories)[number]["value"];
  message: string;
  status: TicketStatus | null;
  user_email: string | null;
  created_at: string;
  replies: FeedbackReply[];
};

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: TicketStatus | null) {
  return {
    open: "Open",
    awaiting_admin: "Needs admin reply",
    answered: "Answered",
    closed: "Closed",
  }[status ?? "open"] ?? status ?? "Open";
}

export function FeedbackBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<FeedbackTab>("new");
  const [category, setCategory] = useState<(typeof categories)[number]["value"]>("idea");
  const [message, setMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [replyStatus, setReplyStatus] = useState<FeedbackState>("idle");
  const [status, setStatus] = useState<FeedbackState>("idle");
  const [error, setError] = useState("");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets],
  );

  const withSession = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Please sign in again before using feedback tickets.");
      return null;
    }

    return session;
  }, []);

  const loadTickets = useCallback(async () => {
    const session = await withSession();
    if (!session) return;

    setIsLoadingTickets(true);
    const response = await fetch("/api/feedback", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as { feedback?: FeedbackTicket[]; error?: string };

    if (!response.ok) {
      setError(payload.error ?? "We could not load your feedback tickets.");
      setIsLoadingTickets(false);
      return;
    }

    setTickets(payload.feedback ?? []);
    setSelectedTicketId((current) => current ?? payload.feedback?.[0]?.id ?? null);
    setIsLoadingTickets(false);
  }, [withSession]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session?.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      if (!session?.user) setIsOpen(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    const id = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(id);
  }, [isAuthenticated, isOpen, loadTickets]);
  
  if (!isAuthenticated) return null;

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError("");

    const session = await withSession();
    if (!session) {
      setStatus("error");
      return;
    }

    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        category,
        message,
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { feedback?: FeedbackTicket; error?: string };
    if (!response.ok || !payload.feedback) {
      setStatus("error");
      setError(payload.error ?? "We could not send your feedback. Please try again.");
      return;
    }

    setTickets((current) => [payload.feedback!, ...current]);
    setSelectedTicketId(payload.feedback.id);
    setStatus("sent");
    setMessage("");
    setActiveTab("tickets");
  };

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;

    setReplyStatus("sending");
    setError("");
    const session = await withSession();
    if (!session) {
      setReplyStatus("error");
      return;
    }

    const response = await fetch(`/api/feedback/${selectedTicket.id}/replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message: replyMessage }),
    });

    const payload = (await response.json().catch(() => ({}))) as { reply?: FeedbackReply; error?: string };
    if (!response.ok || !payload.reply) {
      setReplyStatus("error");
      setError(payload.error ?? "We could not add your reply.");
      return;
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedTicket.id
          ? { ...ticket, status: "awaiting_admin", replies: [...ticket.replies, payload.reply!] }
          : ticket,
      ),
    );
    setReplyMessage("");
    setReplyStatus("sent");
  };

  return (
    <div className={styles.wrapper}>
      {isOpen ? (
        <section className={styles.panel} aria-labelledby="contact-popup-title" data-active-tab={activeTab === "tickets" ? "messages" : "new"}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.header}>
            <div className={styles.titleBlock}>
              <span className={styles.badge}>
                <Sparkles size={14} />
                Community desk
              </span>
              <h2 id="contact-popup-title">Feedback tickets</h2>
              <p>Create a ticket, keep the thread open, and chat with the BareUnity team about follow-up questions.</p>
            </div>
            <button className={styles.iconButton} type="button" aria-label="Close contact popup" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Feedback desk tabs">
            <button className={styles.tabButton} type="button" role="tab" aria-selected={activeTab === "new"} onClick={() => setActiveTab("new")}>
              New ticket
            </button>
            <button className={styles.tabButton} type="button" role="tab" aria-selected={activeTab === "tickets"} onClick={() => setActiveTab("tickets")}>
              My tickets ({tickets.length})
            </button>
          </div>

          {activeTab === "new" ? (
            <form id="feedback-panel" className={styles.form} onSubmit={submitFeedback}>
              <fieldset className={styles.topicGroup}>
                <legend>Choose a topic</legend>
                <div className={styles.topicGrid}>
                  {categories.map(({ value, label, description, Icon }) => (
                    <label key={value} className={styles.topicCard} data-selected={category === value}>
                      <input
                        type="radio"
                        name="feedback-category"
                        value={value}
                        checked={category === value}
                        onChange={() => setCategory(value)}
                      />
                      <span className={styles.topicIcon}>
                        <Icon size={18} />
                      </span>
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.label} htmlFor="feedback-message">
                <span>Message</span>
                <textarea
                  id="feedback-message"
                  className={styles.textarea}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (status !== "sending") setStatus("idle");
                  }}
                  placeholder="What happened? What did you expect? What would make the community feel better?"
                  maxLength={1200}
                  required
                />
              </label>

              <div className={styles.footerRow}>
                <span className={styles.count}>{message.length}/1200 characters</span>
                <button className={styles.submitButton} type="submit" disabled={status === "sending" || message.trim().length < 10}>
                  {status === "sending" ? "Creating ticket…" : "Create ticket"}
                  <Send size={16} />
                </button>
              </div>

              {status === "sent" ? <p className={styles.success}>Thanks — your feedback ticket is open for replies.</p> : null}
              {status === "error" ? <p className={styles.error}>{error}</p> : null}
            </form>
          ) : (
            <div className={styles.messagesPanel}>
              <aside className={styles.ticketList} aria-label="Feedback tickets">
                {isLoadingTickets ? <p className={styles.ticketEmpty}>Loading tickets…</p> : null}
                {!isLoadingTickets && tickets.length === 0 ? (
                  <p className={styles.ticketEmpty}>No tickets yet. Create one and we can continue the conversation here.</p>
                ) : null}
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    className={styles.ticketButton}
                    type="button"
                    data-selected={selectedTicket?.id === ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <span className={styles.ticketTopline}>
                      <strong>{categories.find((item) => item.value === ticket.category)?.label ?? "Feedback"}</strong>
                      <small>{statusLabel(ticket.status)}</small>
                    </span>
                    <span>{ticket.message}</span>
                    <small>{prettyDate(ticket.created_at)}</small>
                  </button>
                ))}
              </aside>

              <section className={styles.threadPane} aria-live="polite">
                {selectedTicket ? (
                  <>
                    <div className={styles.threadHeader}>
                      <div>
                        <strong>{categories.find((item) => item.value === selectedTicket.category)?.label ?? "Feedback"} ticket</strong>
                        <span>{statusLabel(selectedTicket.status)} • opened {prettyDate(selectedTicket.created_at)}</span>
                      </div>
                      <Inbox size={18} />
                    </div>
                    <div className={styles.threadScroll}>
                      <article className={styles.chatBubble} data-author="member">
                        <span>You</span>
                        <p>{selectedTicket.message}</p>
                        <small>{prettyDate(selectedTicket.created_at)}</small>
                      </article>
                      {selectedTicket.replies.map((reply) => (
                        <article key={reply.id} className={styles.chatBubble} data-author={reply.author_role}>
                          <span>{reply.author_role === "admin" ? "BareUnity team" : "You"}</span>
                          <p>{reply.message}</p>
                          <small>{prettyDate(reply.created_at)}</small>
                        </article>
                      ))}
                    </div>
                    {selectedTicket.status === "closed" ? (
                      <p className={styles.success}>This ticket is closed. Create a new ticket if you need more help.</p>
                    ) : (
                      <form className={styles.replyForm} onSubmit={submitReply}>
                        <label className={styles.label} htmlFor="feedback-reply-message">
                          <span>Reply to this ticket</span>
                          <textarea
                            id="feedback-reply-message"
                            className={styles.replyTextarea}
                            value={replyMessage}
                            onChange={(event) => {
                              setReplyMessage(event.target.value);
                              if (replyStatus !== "sending") setReplyStatus("idle");
                            }}
                            placeholder="Add more context or answer the team's question…"
                            maxLength={1200}
                            required
                          />
                        </label>
                        <div className={styles.footerRow}>
                          <span className={styles.count}>{replyMessage.length}/1200 characters</span>
                          <button className={styles.submitButton} type="submit" disabled={replyStatus === "sending" || replyMessage.trim().length < 2}>
                            {replyStatus === "sending" ? "Sending…" : "Reply"}
                            <Send size={16} />
                          </button>
                        </div>
                        {replyStatus === "sent" ? <p className={styles.success}>Reply added — the team can continue from here.</p> : null}
                        {replyStatus === "error" ? <p className={styles.error}>{error}</p> : null}
                      </form>
                    )}
                  </>
                ) : null}
              </section>
            </div>
          )}
        </section>
      ) : null}

      <button
        className={styles.bubble}
        type="button"
        aria-expanded={isOpen}
        aria-controls="contact-popup-title"
        onClick={() => {
          setIsOpen((current) => !current);
          setStatus("idle");
          setReplyStatus("idle");
          setError("");
        }}
      >
        <MessageCircle size={22} />
        <span>Feedback</span>
      </button>
    </div>
  );
}