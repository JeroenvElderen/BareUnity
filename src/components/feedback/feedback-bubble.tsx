"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bug, HelpCircle, Lightbulb, MessageCircle, MoreHorizontal, Send, Sparkles, X } from "lucide-react";

import { MessagesPanelContent } from "@/components/messages/messages-overlay";
import { supabase } from "@/lib/supabase";
import styles from "./feedback-bubble.module.css";

const categories = [
  { value: "idea", label: "Idea", description: "Share a feature or polish request.", Icon: Lightbulb },
  { value: "bug", label: "Bug", description: "Report something broken or confusing.", Icon: Bug },
  { value: "question", label: "Question", description: "Ask about BareUnity or your account.", Icon: HelpCircle },
  { value: "other", label: "Other", description: "Anything else we should know.", Icon: MoreHorizontal },
] as const;

type FeedbackState = "idle" | "sending" | "sent" | "error";
type PopupTab = "feedback" | "messages";

export function FeedbackBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<PopupTab>("messages");
  const [category, setCategory] = useState<(typeof categories)[number]["value"]>("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<FeedbackState>("idle");
  const [error, setError] = useState("");

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

  if (!isAuthenticated) return null;

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setStatus("error");
      setError("Please sign in again before sending feedback.");
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

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setStatus("error");
      setError(payload.error ?? "We could not send your feedback. Please try again.");
      return;
    }

    setStatus("sent");
    setMessage("");
  };

  return (
    <div className={styles.wrapper}>
      {isOpen ? (
        <section className={styles.panel} data-active-tab={activeTab} aria-labelledby="contact-popup-title">
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.header}>
            <div className={styles.titleBlock}>
              <span className={styles.badge}>
                <Sparkles size={14} />
                Community desk
              </span>
              <h2 id="contact-popup-title">Feedback & chats</h2>
            </div>
            <button className={styles.iconButton} type="button" aria-label="Close contact popup" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Contact popup sections">
            <button
              className={styles.tabButton}
              type="button"
              role="tab"
              aria-selected={activeTab === "messages"}
              aria-controls="messages-panel"
              onClick={() => setActiveTab("messages")}
            >
              Chats
            </button>
            <button
              className={styles.tabButton}
              type="button"
              role="tab"
              aria-selected={activeTab === "feedback"}
              aria-controls="feedback-panel"
              onClick={() => setActiveTab("feedback")}
            >
              Feedback
            </button>
            
          </div>

          {activeTab === "feedback" ? (
            <form id="feedback-panel" className={styles.form} role="tabpanel" onSubmit={submitFeedback}>
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
                  {status === "sending" ? "Sending…" : "Send feedback"}
                  <Send size={16} />
                </button>
              </div>

              {status === "sent" ? <p className={styles.success}>Thanks — your feedback was sent to the admin panel.</p> : null}
              {status === "error" ? <p className={styles.error}>{error}</p> : null}
            </form>
          ) : (
            <div id="messages-panel" className={styles.messagesPanel} role="tabpanel">
              <MessagesPanelContent />
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
          setError("");
        }}
      >
        <MessageCircle size={22} />
        <span>Feedback & messages</span>
      </button>
    </div>
  );
}