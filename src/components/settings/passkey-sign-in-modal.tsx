"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import styles from "./passkey-sign-in-modal.module.css";

export type PasskeyCredential = {
  id: string;
  nickname: string;
  addedAt: string;
};

type PasskeySignInModalProps = {
  isOpen: boolean;
  passkeys: PasskeyCredential[];
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onAddPasskey: (nickname: string) => void;
  onRemovePasskey: (id: string) => void;
};

export function PasskeySignInModal({
  isOpen,
  passkeys,
  isSaving,
  errorMessage,
  onCancel,
  onAddPasskey,
  onRemovePasskey,
}: PasskeySignInModalProps) {
  const [nickname, setNickname] = useState("");

  const sortedPasskeys = useMemo(
    () => [...passkeys].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()),
    [passkeys],
  );

  if (!isOpen) return null;

  const trimmedNickname = nickname.trim();

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="passkey-modal-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="passkey-modal-title">Passkey sign-in</h2>
          <p>Add biometrics-backed passkeys for quick, passwordless login on trusted devices.</p>
        </header>

        <div className={styles.content}>
          <label className={styles.label}>
            Device nickname
            <input
              className={styles.input}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="e.g. My iPhone"
              autoFocus
              disabled={isSaving}
            />
          </label>

          <div className={styles.actions}>
            <Button
              type="button"
              onClick={() => {
                onAddPasskey(trimmedNickname || "This device");
                setNickname("");
              }}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Add current device"}
            </Button>
          </div>

          {sortedPasskeys.length ? (
            <ul className={styles.passkeyList}>
              {sortedPasskeys.map((passkey) => (
                <li key={passkey.id} className={styles.passkeyItem}>
                  <div>
                    <h3>{passkey.nickname}</h3>
                    <p>Added {new Date(passkey.addedAt).toLocaleString()}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => onRemovePasskey(passkey.id)} disabled={isSaving}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyState}>No passkeys registered yet.</p>
          )}

          <p className={styles.warning}>
            Removing a passkey signs out that device for passwordless login. Keep at least one recovery method active.
          </p>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <div className={styles.footerActions}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Close
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}