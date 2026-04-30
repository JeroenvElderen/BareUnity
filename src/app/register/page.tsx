"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/app/auth.module.css";
import { supabase } from "@/lib/supabase";

type QuizAnswer = "" | "correct" | "incorrect";

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
  motivation: string;
  consentCode: string;
  quizAnswerRespect: QuizAnswer;
  quizAnswerConsent: QuizAnswer;
  quizAnswerReporting: QuizAnswer;
  isAdultConfirmed: boolean;
  isConsentConfirmed: boolean;
  isPolicyConfirmed: boolean;
  isPhotoRuleConfirmed: boolean;
  idDocument: File | null;
};

const CONSENT_CODE = "NATURISM-FIRST";

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
  motivation: "",
  consentCode: "",
  quizAnswerRespect: "",
  quizAnswerConsent: "",
  quizAnswerReporting: "",
  isAdultConfirmed: false,
  isConsentConfirmed: false,
  isPolicyConfirmed: false,
  isPhotoRuleConfirmed: false,
  idDocument: null,
};

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterState>(initialState);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace("/");
      }
    });
  }, [router]);

  const quizScore = useMemo(() => {
    const answers = [form.quizAnswerRespect, form.quizAnswerConsent, form.quizAnswerReporting];
    return answers.filter((answer) => answer === "correct").length;
  }, [form.quizAnswerRespect, form.quizAnswerConsent, form.quizAnswerReporting]);

  const passwordStrength = useMemo(() => {
    const checks = [
      form.password.length >= 12,
      /[A-Z]/.test(form.password),
      /[a-z]/.test(form.password),
      /\d/.test(form.password),
      /[^A-Za-z0-9]/.test(form.password),
    ];

    const score = checks.filter(Boolean).length;

    if (score <= 2) return "Needs work";
    if (score <= 4) return "Strong";
    return "Excellent";
  }, [form.password]);

  const completionScore = useMemo(() => {
    const checks = [
      form.fullName.trim().length > 0,
      form.displayName.trim().length > 0,
      form.email.trim().length > 0,
      form.password.length >= 12,
      form.confirmPassword.length > 0,
      form.dateOfBirth.length > 0,
      form.country.length > 0,
      form.membershipType.length > 0,
      form.idType.length > 0,
      form.idDocument !== null,
      form.motivation.trim().length >= 30,
      form.consentCode === CONSENT_CODE,
      quizScore === 3,
      form.isAdultConfirmed,
      form.isConsentConfirmed,
      form.isPhotoRuleConfirmed,
      form.isPolicyConfirmed,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form, quizScore]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (form.password !== form.confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    if (!form.idDocument) {
      setStatus("Please upload a government ID file for manual review.");
      return;
    }

    if (quizScore < 3) {
      setStatus("Please pass all 3 safety questions with consent-first answers.");
      return;
    }

    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.set("fullName", form.fullName);
      payload.set("displayName", form.displayName);
      payload.set("email", form.email);
      payload.set("password", form.password);
      payload.set("dateOfBirth", form.dateOfBirth);
      payload.set("country", form.country);
      payload.set("membershipType", form.membershipType);
      payload.set("idType", form.idType);
      payload.set("motivation", form.motivation);
      payload.set("consentCode", form.consentCode);
      payload.set("quizAnswerRespect", form.quizAnswerRespect);
      payload.set("quizAnswerConsent", form.quizAnswerConsent);
      payload.set("quizAnswerReporting", form.quizAnswerReporting);
      payload.set("isAdultConfirmed", String(form.isAdultConfirmed));
      payload.set("isConsentConfirmed", String(form.isConsentConfirmed));
      payload.set("isPolicyConfirmed", String(form.isPolicyConfirmed));
      payload.set("isPhotoRuleConfirmed", String(form.isPhotoRuleConfirmed));

      if (form.idDocument) {
        payload.set("idDocument", form.idDocument);
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        body: payload,
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
          <h1 className={styles.title}>Join safely and set your comfort level</h1>
          <p className={styles.subtitle}>
            Built for consent-first naturist connection. You can use a display name,
            choose privacy boundaries, and complete safety screening before approval.
          </p>

          <div className={styles.stageBanner}>
            <p>
              Application progress <strong>{completionScore}%</strong>
            </p>
            <div className={styles.progressTrack} aria-hidden>
              <span className={styles.progressFill} style={{ width: `${completionScore}%` }} />
            </div>
            <p className={styles.help}>Stage A: Account basics • Stage B: Safety checks • Stage C: Manual review</p>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            <p className={styles.sectionLabel}>A. Account basics</p>
            <label className={styles.field}>
              <span className={styles.label}>Legal full name (private, review-only)</span>
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
              <span className={styles.label}>Display name (shown publicly)</span>
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
              <span className={styles.label}>Email (for login and safety notices)</span>
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
                <span className={styles.label}>Password (12+ chars)</span>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    type={isPasswordVisible ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeButton}
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                  >
                    {isPasswordVisible ? "Hide" : "Show"}
                  </button>
                </div>
                <p className={styles.help}>Strength: {passwordStrength}</p>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Confirm password</span>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeButton}
                    onClick={() => setIsConfirmPasswordVisible((prev) => !prev)}
                  >
                    {isConfirmPasswordVisible ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>

            <div className={styles.split}>
              <label className={styles.field}>
                <span className={styles.label}>Date of birth (18+ only)</span>
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

            <p className={styles.sectionLabel}>B. Safety checks</p>
            <label className={styles.field}>
              <span className={styles.label}>Government ID type for manual review</span>
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
              <span className={styles.label}>Upload government ID (JPG, PNG, WEBP, PDF • max 10MB)</span>
              <input
                className={styles.file}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, idDocument: event.target.files?.[0] ?? null }))
                }
                required
              />
              <p className={styles.help}>Used only for verification. Not displayed on your profile.</p>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Why are you joining this community? (30+ chars)</span>
              <textarea
                className={styles.textarea}
                value={form.motivation}
                onChange={(event) => setForm((prev) => ({ ...prev, motivation: event.target.value }))}
                placeholder="Share your naturist values, boundaries, and what respectful participation means to you."
                minLength={30}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Consent code (type exactly: {CONSENT_CODE})</span>
              <input
                className={styles.input}
                type="text"
                value={form.consentCode}
                onChange={(event) => setForm((prev) => ({ ...prev, consentCode: event.target.value }))}
                required
              />
            </label>

            <fieldset className={styles.quizCard}>
              <legend className={styles.label}>Safety quiz (must score 3/3) — current score: {quizScore}/3</legend>

              <label className={styles.field}>
                <span className={styles.label}>1) You see a new member being mocked in comments. What do you do?</span>
                <select
                  className={styles.select}
                  value={form.quizAnswerRespect}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quizAnswerRespect: event.target.value as QuizAnswer,
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select answer
                  </option>
                  <option value="correct">Report the harassment and support respectful conduct.</option>
                  <option value="incorrect">Join in because it is probably a joke.</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>2) Is it okay to share or screenshot someone&apos;s photo without consent?</span>
                <select
                  className={styles.select}
                  value={form.quizAnswerConsent}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quizAnswerConsent: event.target.value as QuizAnswer,
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select answer
                  </option>
                  <option value="correct">No. Explicit consent is required every time.</option>
                  <option value="incorrect">Yes, if the profile is public.</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>3) What should you do with sexual solicitation or unsafe behavior?</span>
                <select
                  className={styles.select}
                  value={form.quizAnswerReporting}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quizAnswerReporting: event.target.value as QuizAnswer,
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select answer
                  </option>
                  <option value="correct">Report immediately; violations can trigger removal.</option>
                  <option value="incorrect">Ignore it and let others handle it.</option>
                </select>
              </label>
            </fieldset>

            <p className={styles.sectionLabel}>C. Consent and policy</p>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isAdultConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isAdultConfirmed: event.target.checked }))
                }
                required
              />
              I confirm I am at least 18 years old and legally allowed to join in my country.
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
              I agree to consent-first conduct, no unsolicited sexual content, and respectful communication.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isPhotoRuleConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isPhotoRuleConfirmed: event.target.checked }))
                }
                required
              />
              I will never screenshot, download, or share another member&apos;s media without explicit consent.
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
              I agree to BareUnity&apos;s Terms, Privacy Policy, and strict moderation guidelines.
            </label>

            <button className={styles.button} type="submit" disabled={isLoading}>
              {isLoading ? "Submitting application..." : "Create account and submit for review"}
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
          New accounts remain in manual verification review before full platform privileges are granted.
        </p>
      </section>
    </main>
  );
}