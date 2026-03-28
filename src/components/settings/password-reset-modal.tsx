"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import styles from "./password-reset-modal.module.css";

type PasswordResetModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSave: (oldPassword: string, newPassword: string) => void;
};

export function PasswordResetModal({ isOpen, isSaving, errorMessage, onCancel, onSave }: PasswordResetModalProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const trimmedOldPassword = oldPassword.trim();
  const trimmedNewPassword = newPassword.trim();
  const trimmedConfirmPassword = confirmPassword.trim();

  const mismatchMessage = useMemo(() => {
    if (!trimmedNewPassword || !trimmedConfirmPassword) return null;
    if (trimmedNewPassword !== trimmedConfirmPassword) return "New passwords must match.";
    if (trimmedNewPassword === trimmedOldPassword) return "New password must be different from your old password.";
    return null;
  }, [trimmedConfirmPassword, trimmedNewPassword, trimmedOldPassword]);

  if (!isOpen) return null;

  const canSave =
    !isSaving &&
    !mismatchMessage &&
    Boolean(trimmedOldPassword) &&
    Boolean(trimmedNewPassword) &&
    Boolean(trimmedConfirmPassword);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="password-modal-title">Reset password</h2>
          <p>Confirm your old password, then enter your new password twice.</p>
        </header>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSave(trimmedOldPassword, trimmedNewPassword);
          }}
        >
          <label className={styles.label}>
            Old password
            <input
              className={styles.input}
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder="Enter your current password"
              autoComplete="current-password"
              autoFocus
            />
          </label>

          <label className={styles.label}>
            New password
            <input
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter a new password"
              autoComplete="new-password"
            />
          </label>

          <label className={styles.label}>
            Confirm new password
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your new password"
              autoComplete="new-password"
            />
          </label>

          {mismatchMessage ? <p className={styles.error}>{mismatchMessage}</p> : null}
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