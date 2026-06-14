"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import styles from "@/components/auth/auth-page.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatus("");

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus(error.message);
      setIsSaving(false);
      return;
    }

    setStatus("Password updated successfully.");

    setTimeout(() => {
      router.replace("/login");
    }, 1500);

    setIsSaving(false);
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.brand}>
          <Image
            src="/logo.png"
            alt=""
            width={1254}
            height={1254}
            className={styles.brandLogo}
            priority
          />
          <span>BareUnity • Password Reset</span>
        </p>

        <article className={styles.card}>
          <h1 className={styles.title}>Create a new password</h1>

          <p className={styles.subtitle}>
            Enter a new password for your account.
          </p>

          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>New password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Confirm password</span>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>

            <button
              className={styles.button}
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Updating password..." : "Update password"}
            </button>

            {status ? (
              <p className={styles.help}>{status}</p>
            ) : null}
          </form>
        </article>
      </section>
    </main>
  );
}
