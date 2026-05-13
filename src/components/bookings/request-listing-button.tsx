"use client";

import { type FormEvent, useState } from "react";

import { supabase } from "@/lib/supabase";
import styles from "./request-listing-button.module.css";

export type BookingRequestType = "stay" | "spa" | "activity";

type RequestListingButtonProps = {
  requestType: BookingRequestType;
  label?: string;
};

type FormState = {
  placeName: string;
  locationHint: string;
  website: string;
  notes: string;
};

const REQUEST_LABELS: Record<BookingRequestType, string> = {
  stay: "stay",
  spa: "spa",
  activity: "activity",
};

const INITIAL_FORM: FormState = {
  placeName: "",
  locationHint: "",
  website: "",
  notes: "",
};

export function RequestListingButton({
  requestType,
  label,
}: RequestListingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const requestLabel = REQUEST_LABELS[requestType];

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeDialog() {
    if (isSubmitting) return;
    setIsOpen(false);
    setStatus(null);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in before submitting a request.");
      }

      const response = await fetch("/api/map-spot-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeName: form.placeName,
          locationHint: form.locationHint,
          website: form.website,
          notes: form.notes,
          requestType,
          isStay: requestType === "stay",
          pageUrl: window.location.pathname,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not submit this request.");
      }

      setForm(INITIAL_FORM);
      setStatus({
        type: "success",
        message: `Thanks — your ${requestLabel} request was sent to the admin team.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Could not submit request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.requestWrap}>
      <button
        className={styles.requestButton}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        {label ?? `Request a ${requestLabel}`}
      </button>

      {isOpen ? (
        <div className={styles.backdrop} role="presentation">
          <section
            aria-modal="true"
            className={styles.dialog}
            role="dialog"
            aria-labelledby={`${requestType}-request-title`}
          >
            <div className={styles.dialogHeader}>
              <h2 id={`${requestType}-request-title`}>
                Request a {requestLabel}
              </h2>
              <p>
                Send us the details and an admin will review it before adding it
                to BareUnity.
              </p>
            </div>

            <form className={styles.form} onSubmit={submitRequest}>
              <label className={styles.field}>
                <span>Name *</span>
                <input
                  required
                  value={form.placeName}
                  onChange={(event) =>
                    updateField("placeName", event.target.value)
                  }
                  placeholder={`Name of the ${requestLabel}`}
                />
              </label>

              <label className={styles.field}>
                <span>Location *</span>
                <input
                  required
                  value={form.locationHint}
                  onChange={(event) =>
                    updateField("locationHint", event.target.value)
                  }
                  placeholder="City, region, country, or address"
                />
              </label>

              <label className={styles.field}>
                <span>Website</span>
                <input
                  type="url"
                  value={form.website}
                  onChange={(event) =>
                    updateField("website", event.target.value)
                  }
                  placeholder="https://"
                />
              </label>

              <label className={styles.field}>
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Why should this be added? Any naturist-friendly details?"
                />
              </label>

              {status ? (
                <p
                  className={
                    status.type === "success"
                      ? styles.statusSuccess
                      : styles.statusError
                  }
                >
                  {status.message}
                </p>
              ) : null}

              <div className={styles.actions}>
                <button
                  className={styles.cancelButton}
                  type="button"
                  disabled={isSubmitting}
                  onClick={closeDialog}
                >
                  Close
                </button>
                <button
                  className={styles.submitButton}
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending..." : "Send request"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
