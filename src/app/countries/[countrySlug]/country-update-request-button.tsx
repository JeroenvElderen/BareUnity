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

type SuggestedField = {
  name: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

const suggestedFields: SuggestedField[] = [
  { name: "tagline", label: "Tagline", placeholder: "Short discovery intro" },
  { name: "heroImage", label: "Hero image URL", placeholder: "https://..." },
  { name: "legalStatus", label: "Legal status", placeholder: "Allowed, restricted, researching..." },
  { name: "beachesCount", label: "Official beaches", placeholder: "Number or guidance" },
  { name: "resortsCount", label: "Naturist resorts", placeholder: "Number or guidance" },
  { name: "communityRating", label: "BareUnity rating", placeholder: "Example: 4.5" },
  { name: "communityMembers", label: "Members visited", placeholder: "Example: 120" },
  { name: "glance", label: "At a glance", placeholder: "Capital, language, currency, time zone, driving side, plug type...", multiline: true },
  { name: "cultureScores", label: "Culture scores", placeholder: "Social acceptance, beginner friendly, family friendly, LGBT friendly, safety, tourist friendly...", multiline: true },
  { name: "laws", label: "Naturist laws", placeholder: "Public nudity, beaches, photography rules, local cautions...", multiline: true },
  { name: "regions", label: "Best regions", placeholder: "Region names, score, and local naturist details...", multiline: true },
  { name: "beaches", label: "Top beaches", placeholder: "Beach names, region, rating, image link, summary...", multiline: true },
  { name: "season", label: "Season guide", placeholder: "Monthly air temp, sea temp, and naturist suitability...", multiline: true },
  { name: "firstTimeTips", label: "First-time tips", placeholder: "Checklist items for first-time visitors...", multiline: true },
  { name: "etiquette", label: "Naturist etiquette", placeholder: "Local etiquette and consent reminders...", multiline: true },
  { name: "bestTime", label: "Best time to visit", placeholder: "Seasonal recommendation", multiline: true },
  { name: "faqs", label: "Frequently asked", placeholder: "Questions members may ask about this country...", multiline: true },
  { name: "tags", label: "Tags", placeholder: "Comma-separated tags" },
];

type SuggestedFieldValues = Record<(typeof suggestedFields)[number]["name"], string>;

const emptySuggestedFields = suggestedFields.reduce((fields, field) => {
  fields[field.name] = "";
  return fields;
}, {} as Record<string, string>) as SuggestedFieldValues;

function buildStructuredMessage(message: string, fields: SuggestedFieldValues) {
  const entries = suggestedFields
    .map((field) => ({ label: field.label, value: fields[field.name].trim() }))
    .filter((field) => field.value.length > 0);

  if (entries.length === 0) return message.trim();

  return [
    message.trim(),
    "",
    "Suggested country page fields:",
    ...entries.map((field) => `${field.label}: ${field.value}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function CountryUpdateRequestButton({
  countrySlug,
  countryName,
}: CountryUpdateRequestButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [changeType, setChangeType] = useState<(typeof changeTypes)[number]["value"]>("general");
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestedFieldValues, setSuggestedFieldValues] = useState<SuggestedFieldValues>(emptySuggestedFields);
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
          message: buildStructuredMessage(message, suggestedFieldValues),
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
      setSuggestedFieldValues(emptySuggestedFields);
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

            <fieldset className={styles.updateRequestFieldset}>
              <legend>Country page fields to add</legend>
              <p>Use any fields you already know. Inputs are intentionally blank so you can add only new information.</p>
              <div className={styles.updateRequestFieldGrid}>
                {suggestedFields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {field.multiline ? (
                      <textarea
                        value={suggestedFieldValues[field.name]}
                        onChange={(event) =>
                          setSuggestedFieldValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        value={suggestedFieldValues[field.name]}
                        onChange={(event) =>
                          setSuggestedFieldValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

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
