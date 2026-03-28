"use client";

import { Button } from "@/components/ui/button";
import styles from "./recovery-keys-modal.module.css";

type RecoveryKeysModalProps = {
  isOpen: boolean;
  recoveryKeys: string[];
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onGenerate: () => void;
};

export function RecoveryKeysModal({
  isOpen,
  recoveryKeys,
  isSaving,
  errorMessage,
  onCancel,
  onGenerate,
}: RecoveryKeysModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="recovery-keys-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="recovery-keys-modal-title">Recovery keys</h2>
          <p>Generate one-time backup keys for sign-in recovery when your normal login method is unavailable.</p>
        </header>

        <div className={styles.form}>
          {recoveryKeys.length ? (
            <ul className={styles.keyList}>
              {recoveryKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyState}>No recovery keys generated yet.</p>
          )}

          <p className={styles.warning}>
            Save these keys in a secure offline location. Regenerating creates a new set and invalidates existing keys.
          </p>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Close
            </Button>
            <Button type="button" onClick={onGenerate} disabled={isSaving}>
              {isSaving ? "Generating..." : recoveryKeys.length ? "Regenerate" : "Generate"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}