"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/auth.module.css";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const markPostLoginHydration = () => {
    window.sessionStorage.setItem("bareunity_post_login_loading", "true");
  };

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace("/");
      }
    });
  }, [router]);
  
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message);
      setIsLoading(false);
      return;
    }

    setStatus(
      twoFactorCode
        ? "Signed in. 2FA code capture is enabled in UI; verification hookup comes next."
        : "Signed in successfully.",
    );

    if (rememberDevice) {
      localStorage.setItem("bareunity_remember_device", "true");
    }

    setIsLoading(false);
    markPostLoginHydration();
    router.push("/");
    router.refresh();
  }

  async function onPasskeySignIn() {
    setStatus("");
    setIsLoading(true);

    if (!email.trim() || !password) {
      setStatus("Enter your email and password first, then use passkey sign-in.");
      setIsLoading(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.signInWithPassword({ email, password });
    if (passwordError) {
      setStatus(passwordError.message || "Could not start passkey sign-in.");
      setIsLoading(false);
      return;
    }

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setStatus(factorsError.message || "Could not load your passkeys.");
      setIsLoading(false);
      return;
    }

    const passkeyFactor = factorsData.all.find((factor) => factor.factor_type === "webauthn" && factor.status === "verified");
    if (!passkeyFactor) {
      setStatus("No verified passkey found for this account. Add one in Settings first.");
      setIsLoading(false);
      return;
    }

    const { error: passkeyError } = await supabase.auth.mfa.webauthn.authenticate({ factorId: passkeyFactor.id });
    if (passkeyError) {
      setStatus(passkeyError.message || "Passkey verification failed.");
      setIsLoading(false);
      return;
    }

    setStatus("Signed in with passkey.");
    setIsLoading(false);
    markPostLoginHydration();
    router.push("/");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.brand}>🌿 BareUnity • Welcome back</p>
        <article className={styles.card}>
          <h1 className={styles.title}>Sign in to your account</h1>
          <p className={styles.subtitle}>
            Access your profile, events, and verified community spaces.
          </p>

          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.input}
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>2FA code (if enabled)</span>
              <input
                className={styles.input}
                placeholder="123456"
                type="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
              />
            </label>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
              />
              Keep me signed in on this trusted device.
            </label>

            <button className={styles.button} type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            <button className={styles.button} type="button" onClick={() => void onPasskeySignIn()} disabled={isLoading}>
              {isLoading ? "Checking passkey..." : "Sign in with passkey"}
            </button>
            
            {status ? <p className={styles.help}>{status}</p> : null}

            <p className={styles.alt}>
              New to BareUnity?{" "}
              <Link className={styles.link} href="/register">
                Create an account
              </Link>
            </p>
          </form>
        </article>
      </section>
    </main>
  );
}