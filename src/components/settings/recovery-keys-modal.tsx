"use client";

import { Button } from "@/components/ui/button";
import styles from "./recovery-keys-modal.module.css";

type RecoveryKeysModalProps = {
  isOpen: boolean;
  recoveryKeys: string[];
  hasExistingKeys: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onGenerate: () => void;
};

export function RecoveryKeysModal({
  isOpen,
  recoveryKeys,
  hasExistingKeys,
  isSaving,
  errorMessage,
  onCancel,
  onGenerate,
}: RecoveryKeysModalProps) {
  if (!isOpen) return null;

  const hasGeneratedKeysToShow = recoveryKeys.length > 0;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="recovery-keys-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="recovery-keys-modal-title">Recovery keys</h2>
          <p>
            Generate one-time backup keys for sign-in recovery. BareUnity only stores protected hashes; the plain keys are shown once and are not shared with anyone.
          </p>
        </header>

        <div className={styles.form}>
          {hasGeneratedKeysToShow ? (
            <>
              <p className={styles.success}>
                Copy these keys now. Closing this window clears the plain keys from the page.
              </p>
              <ul className={styles.keyList} aria-label="New recovery keys">
                {recoveryKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.emptyState}>
              {hasExistingKeys
                ? "Recovery keys are already enabled. For your safety, saved keys are never displayed again."
                : "No recovery keys have been generated yet."}
            </p>
          )}

          <p className={styles.warning}>
            Store keys offline in a password manager or printed backup. Generating a new set invalidates the previous set.
          </p>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Close
            </Button>
            <Button type="button" onClick={onGenerate} disabled={isSaving}>
              {isSaving ? "Generating..." : hasExistingKeys ? "Regenerate keys" : "Generate keys"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}