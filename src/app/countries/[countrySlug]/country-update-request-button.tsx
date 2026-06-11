"use client";

import { FormEvent, useState } from "react";
import { Send, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type CountryUpdateRequestButtonProps = {
  countrySlug: string;
  countryName: string;
};

const changeTypes = [
  { value: "laws", label: "Laws or rules" },
  { value: "beach", label: "Beach details" },
  { value: "resort", label: "Resort details" },
  { value: "safety", label: "Safety / etiquette" },
  { value: "season", label: "Season or weather" },
  { value: "general", label: "General info" },
] as const;

export function CountryUpdateRequestButton({
  countrySlug,
  countryName,
}: CountryUpdateRequestButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [changeType, setChangeType] = useState<(typeof changeTypes)[number]["value"]>("general");
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [notice, setNotice] = useState("");

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setNotice("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Please sign in before sending a country update request.");
      }

      const response = await fetch("/api/country-update-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countrySlug,
          countryName,
          changeType,
          message,
          sourceUrl,
          pageUrl: window.location.href,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send this update request.");
      }

      setStatus("success");
      setNotice("Thanks — the admin team will review your suggested change.");
      setMessage("");
      setSourceUrl("");
    } catch (error) {
      setStatus("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not send this update request.",
      );
    }
  }

  return (
    <div className={styles.updateRequestWrap}>
      <button
        className={styles.updateRequestButton}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Send size={16} /> Request an update
      </button>

      {isOpen ? (
        <div className={styles.updateRequestPanel} role="dialog" aria-modal="false">
          <div className={styles.updateRequestHeader}>
            <div>
              <strong>Suggest a change for {countryName}</strong>
              <p>Tell admins what is outdated, missing, or incorrect.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close update request form">
              <X size={16} />
            </button>
          </div>

          <form className={styles.updateRequestForm} onSubmit={submitRequest}>
            <label>
              What needs updating?
              <select
                value={changeType}
                onChange={(event) => setChangeType(event.target.value as typeof changeType)}
              >
                {changeTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Details
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={10}
                maxLength={1200}
                rows={4}
                placeholder="Example: This beach is now textile-only, or this resort has closed."
                required
              />
            </label>
            <label>
              Source link (optional)
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            {notice ? (
              <p className={status === "success" ? styles.updateSuccess : styles.updateError}>
                {notice}
              </p>
            ) : null}
            <button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Sending…" : "Send request"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
