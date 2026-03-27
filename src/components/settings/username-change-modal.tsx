"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import styles from "./username-change-modal.module.css";

type UsernameChangeModalProps = {
  isOpen: boolean;
  currentUsername: string;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSave: (nextUsername: string) => void;
};

export function UsernameChangeModal({
  isOpen,
  currentUsername,
  isSaving,
  errorMessage,
  onCancel,
  onSave,
}: UsernameChangeModalProps) {
  const [nextUsername, setNextUsername] = useState(currentUsername);

  if (!isOpen) return null;

  const normalizedCurrent = currentUsername.trim().toLowerCase();
  const normalizedNext = nextUsername.trim().toLowerCase();
  const isUnchanged = normalizedCurrent === normalizedNext;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="username-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="username-modal-title">Change username</h2>
          <p>Update your @handle used in mentions and search.</p>
        </header>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onSave(nextUsername.trim());
          }}
        >
          <label className={styles.label}>
            Current username
            <output className={styles.value}>@{currentUsername}</output>
          </label>

          <label className={styles.label}>
            New username
            <input
              className={styles.input}
              value={nextUsername}
              onChange={(event) => setNextUsername(event.target.value)}
              placeholder="Enter a new username"
              autoFocus
            />
          </label>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || isUnchanged || !nextUsername.trim()}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}