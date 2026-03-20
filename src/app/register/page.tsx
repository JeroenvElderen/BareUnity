"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "@/app/auth.module.css";

type RegisterState = {
  fullName: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  country: string;
  membershipType: string;
  idType: string;
  isAdultConfirmed: boolean;
  isConsentConfirmed: boolean;
  isPolicyConfirmed: boolean;
};

const initialState: RegisterState = {
  fullName: "",
  displayName: "",
  email: "",
  password: "",
  confirmPassword: "",
  dateOfBirth: "",
  country: "",
  membershipType: "",
  idType: "",
  isAdultConfirmed: false,
  isConsentConfirmed: false,
  isPolicyConfirmed: false,
};

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterState>(initialState);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (form.password !== form.confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setStatus(data.error ?? "Registration failed.");
        return;
      }

      setStatus(data.message ?? "Account created. You can sign in now.");
      setForm(initialState);
    } catch {
      setStatus("Something went wrong while creating your account.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.brand}>🌿 BareUnity • Naturist Community</p>
        <article className={styles.card}>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>
            Join respectfully. We verify profiles to keep the community safe,
            adult, and authentic.
          </p>

          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Full name</span>
              <input
                className={styles.input}
                placeholder="Alex Morgan"
                type="text"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Display name</span>
              <input
                className={styles.input}
                placeholder="NatureAlex"
                type="text"
                value={form.displayName}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.input}
                placeholder="you@example.com"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>

            <div className={styles.split}>
              <label className={styles.field}>
                <span className={styles.label}>Password</span>
                <input
                  className={styles.input}
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Confirm password</span>
                <input
                  className={styles.input}
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  required
                />
              </label>
            </div>

            <div className={styles.split}>
              <label className={styles.field}>
                <span className={styles.label}>Date of birth</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) => setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Country</span>
                <select
                  className={styles.select}
                  value={form.country}
                  onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select country
                  </option>
                  <option>United States</option>
                  <option>Canada</option>
                  <option>United Kingdom</option>
                  <option>Germany</option>
                  <option>France</option>
                  <option>Spain</option>
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Membership type</span>
              <select
                className={styles.select}
                value={form.membershipType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, membershipType: event.target.value }))
                }
                required
              >
                <option value="" disabled>
                  Select one
                </option>
                <option>Individual</option>
                <option>Couple</option>
                <option>Family (adults only account holder)</option>
                <option>Event host / club organizer</option>
              </select>
            </label>

            <p className={styles.sectionLabel}>Verification</p>
            <label className={styles.field}>
              <span className={styles.label}>Government ID type</span>
              <select
                className={styles.select}
                value={form.idType}
                onChange={(event) => setForm((prev) => ({ ...prev, idType: event.target.value }))}
                required
              >
                <option value="" disabled>
                  Choose ID type
                </option>
                <option>Passport</option>
                <option>Driver&apos;s license</option>
                <option>National ID card</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Upload verification selfie (optional now)</span>
              <input className={styles.file} type="file" disabled />
              <p className={styles.help}>
                File upload can be enabled once verification storage is connected.
              </p>
            </label>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isAdultConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isAdultConfirmed: event.target.checked }))
                }
                required
              />
              I confirm I am at least 18 years old and legally allowed to join
              naturist communities in my country.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isConsentConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isConsentConfirmed: event.target.checked }))
                }
                required
              />
              I agree to consent-first conduct, no screenshots without
              permission, and respectful communication.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isPolicyConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isPolicyConfirmed: event.target.checked }))
                }
                required
              />
              I agree to BareUnity&apos;s Terms, Privacy Policy, and moderation
              guidelines.
            </label>

            <button className={styles.button} type="submit" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </button>

            {status ? <p className={styles.help}>{status}</p> : null}

            <p className={styles.alt}>
              Already have an account?{" "}
              <Link className={styles.link} href="/login">
                Sign in
              </Link>
            </p>
          </form>
        </article>

        <p className={styles.legal}>
          Verification helps us reduce fake profiles and protect community
          members.
        </p>
      </section>
    </main>
  );
}