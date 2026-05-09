"use client";

import { FormEvent, useEffect, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import styles from "./feedback-bubble.module.css";

const categories = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
] as const;

type FeedbackState = "idle" | "sending" | "sent" | "error";

export function FeedbackBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
        <section className={styles.panel} aria-labelledby="feedback-title">
          <div className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Feedback</p>
              <h2 id="feedback-title">How can BareUnity improve?</h2>
            </div>
            <button className={styles.iconButton} type="button" aria-label="Close feedback" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <form className={styles.form} onSubmit={submitFeedback}>
            <label className={styles.label} htmlFor="feedback-category">
              Topic
              <select
                id="feedback-category"
                className={styles.select}
                value={category}
                onChange={(event) => setCategory(event.target.value as typeof category)}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className={styles.label} htmlFor="feedback-message">
              Message
              <textarea
                id="feedback-message"
                className={styles.textarea}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (status !== "sending") setStatus("idle");
                }}
                placeholder="Tell the admin what happened, what you expected, or what would make the community better."
                maxLength={1200}
                required
              />
            </label>

            <div className={styles.footerRow}>
              <span className={styles.count}>{message.length}/1200</span>
              <button className={styles.submitButton} type="submit" disabled={status === "sending" || message.trim().length < 10}>
                {status === "sending" ? "Sending…" : "Send"}
                <Send size={16} />
              </button>
            </div>

            {status === "sent" ? <p className={styles.success}>Thanks — your feedback was sent to the admin panel.</p> : null}
            {status === "error" ? <p className={styles.error}>{error}</p> : null}
          </form>
        </section>
      ) : null}

      <button
        className={styles.bubble}
        type="button"
        aria-expanded={isOpen}
        aria-controls="feedback-title"
        onClick={() => {
          setIsOpen((current) => !current);
          setStatus("idle");
          setError("");
        }}
      >
        <MessageCircle size={22} />
        <span>Feedback</span>
      </button>
    </div>
  );
}