"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import styles from "./primary-email-modal.module.css";

type PrimaryEmailModalProps = {
  isOpen: boolean;
  currentEmail: string;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSave: (nextEmail: string) => void;
};

export function PrimaryEmailModal({
  isOpen,
  currentEmail,
  isSaving,
  errorMessage,
  onCancel,
  onSave,
}: PrimaryEmailModalProps) {
  const [nextEmail, setNextEmail] = useState(currentEmail);
  const [confirmEmail, setConfirmEmail] = useState("");

  const trimmedCurrentEmail = currentEmail.trim().toLowerCase();
  const trimmedNextEmail = nextEmail.trim().toLowerCase();
  const trimmedConfirmEmail = confirmEmail.trim().toLowerCase();

  const validationMessage = useMemo(() => {
    if (!trimmedNextEmail || !trimmedConfirmEmail) return null;
    if (trimmedNextEmail !== trimmedConfirmEmail) return "Email addresses must match.";
    if (trimmedNextEmail === trimmedCurrentEmail) return "New email must be different from your current email.";
    return null;
  }, [trimmedConfirmEmail, trimmedCurrentEmail, trimmedNextEmail]);

  if (!isOpen) return null;

  const canSave =
    !isSaving && !validationMessage && Boolean(trimmedNextEmail) && Boolean(trimmedConfirmEmail) && Boolean(trimmedCurrentEmail);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="primary-email-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="primary-email-modal-title">Change primary email</h2>
          <p>Update the email address used for sign-in and account verification.</p>
        </header>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSave(trimmedNextEmail);
          }}
        >
          <label className={styles.label}>
            Current email
            <output className={styles.value}>{currentEmail}</output>
          </label>

          <label className={styles.label}>
            New email
            <input
              className={styles.input}
              type="email"
              value={nextEmail}
              onChange={(event) => setNextEmail(event.target.value)}
              placeholder="Enter a new email"
              autoComplete="email"
              autoFocus
            />
          </label>

          <label className={styles.label}>
            Confirm new email
            <input
              className={styles.input}
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              placeholder="Re-enter your new email"
              autoComplete="email"
            />
          </label>

          {validationMessage ? <p className={styles.error}>{validationMessage}</p> : null}
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}