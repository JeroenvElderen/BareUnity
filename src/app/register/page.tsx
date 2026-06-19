"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/auth/auth-page.module.css";
import { IdRedactionUploader } from "@/components/verification/id-redaction-uploader";
import { COUNTRY_NAMES } from "@/lib/countries";
import { supabase } from "@/lib/supabase";

type AccountAccess = "verified" | "viewOnly" | "invite";

type RegisterState = {
  fullName: string;
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  country: string;
  membershipType: string;
  accountAccess: AccountAccess;
  inviteCode: string;
  idType: string;
  motivation: string;
  isAdultConfirmed: boolean;
  isConsentConfirmed: boolean;
  isPolicyConfirmed: boolean;
  isPhotoRuleConfirmed: boolean;
  isSensitiveIdDetailsHidden: boolean;
  idDocument: File | null;
};

const initialState: RegisterState = {
  fullName: "",
  displayName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  dateOfBirth: "",
  country: "",
  membershipType: "",
  accountAccess: "viewOnly",
  inviteCode: "",
  idType: "",
  motivation: "",
  isAdultConfirmed: false,
  isConsentConfirmed: false,
  isPolicyConfirmed: false,
  isPhotoRuleConfirmed: false,
  isSensitiveIdDetailsHidden: false,
  idDocument: null,
};

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterState>(initialState);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [isInviteMode, setIsInviteMode] = useState(false);
  const router = useRouter();

  const completeDiscordInviteRegistration = useCallback(async (
    payload: Partial<RegisterState>,
    accessToken: string,
  ) => {
    setIsInviteMode(true);
    setIsLoading(true);
    setStatus("Completing your Discord invite registration...");

    try {
      setForm((prev) => ({
        ...prev,
        accountAccess: "invite",
        fullName: payload.fullName ?? prev.fullName,
        username: payload.username ?? prev.username,
      }));

      const response = await fetch("/api/auth/discord-invite-register", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setStatus(responsePayload.error ?? "Discord invite registration failed.");
        return;
      }

      window.localStorage.removeItem("bareunity_pending_discord_invite");
      setStatus(responsePayload.message ?? "Discord invite registration complete.");
      router.replace("/");
      router.refresh();
    } catch {
      setStatus("Could not complete Discord invite registration.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hasInviteLink = searchParams.has("invite");

    const completePendingDiscordInvite = async () => {
      const pendingInvite = window.localStorage.getItem(
        "bareunity_pending_discord_invite",
      );

      const { data } = await supabase.auth.getSession();

      if (!data.session?.user) {
        return;
      }

      if (!pendingInvite) {
        if (hasInviteLink) {
          setIsInviteMode(true);
          setStatus(
            "You are signed in with Discord. Enter your name and username, then finish registration.",
          );
          return;
        }

        router.replace("/");
        return;
      }

      const payload = JSON.parse(pendingInvite) as Partial<RegisterState>;
      await completeDiscordInviteRegistration(payload, data.session.access_token);
    };

    void completePendingDiscordInvite();

    const inviteCode = searchParams.get("invite") ?? "";

    if (hasInviteLink) {
      setIsInviteMode(true);
      setForm((prev) => ({
        ...prev,
        accountAccess: "invite",
        inviteCode: inviteCode.trim(),
        idType: "",
        idDocument: null,
        isSensitiveIdDetailsHidden: false,
        motivation: "",
      }));
    }
  }, [completeDiscordInviteRegistration, router]);

  const isVerifiedApplication = form.accountAccess === "verified";
  const isInviteRegistration = form.accountAccess === "invite";
  const accountAccessLabel = isInviteRegistration
    ? "Trusted partner invite"
    : isVerifiedApplication
      ? "Verified member"
      : "7-day Visitor Pass";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (isInviteRegistration) {
      setStatus("Use the Discord registration button for trusted partner invites.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    if (isVerifiedApplication && !form.idDocument) {
      setStatus(
        "Please upload a government ID file so our team can manually review and approve your account.",
      );
      return;
    }

    if (isVerifiedApplication && !form.isSensitiveIdDetailsHidden) {
      setStatus(
        "Please confirm only your legal name, date of birth, and the official ID seal/logo/header remain visible.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const emailForRegistration = form.email.trim().toLowerCase();
      const payload = new FormData();
      const submittedDisplayName = isInviteRegistration
        ? form.fullName
        : form.displayName;

      payload.set("name", submittedDisplayName);
      payload.set("fullName", form.fullName);
      payload.set("displayName", submittedDisplayName);
      payload.set("username", form.username);
      payload.set("email", emailForRegistration);
      payload.set("password", form.password);
      payload.set("dateOfBirth", form.dateOfBirth);
      payload.set("country", form.country);
      payload.set("membershipType", form.membershipType);
      payload.set("accountAccess", form.accountAccess);
      payload.set("inviteCode", form.inviteCode);
      payload.set("idType", form.idType);
      payload.set("motivation", form.motivation);
      payload.set("isAdultConfirmed", String(form.isAdultConfirmed));
      payload.set("isConsentConfirmed", String(form.isConsentConfirmed));
      payload.set("isPolicyConfirmed", String(form.isPolicyConfirmed));
      payload.set("isPhotoRuleConfirmed", String(form.isPhotoRuleConfirmed));
      payload.set(
        "isSensitiveIdDetailsHidden",
        String(form.isSensitiveIdDetailsHidden),
      );

      if (form.idDocument) {
        payload.set("idDocument", form.idDocument);
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        body: payload,
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setStatus(data.error ?? "Registration failed.");
        return;
      }

      setStatus(
        data.message ??
          "Account created. Check your email to confirm your address before signing in.",
      );
      setForm({ ...initialState, accountAccess: form.accountAccess });
    } catch {
      setStatus("Something went wrong while creating your account.");
    } finally {
      setIsLoading(false);
    }
  }

  async function onDiscordInviteRegistration() {
    setStatus("");

    if (!form.fullName.trim() || !form.username.trim()) {
      setStatus("Enter your name and BareUnity username before continuing with Discord.");
      return;
    }

    window.localStorage.setItem(
      "bareunity_pending_discord_invite",
      JSON.stringify({
        fullName: form.fullName,
        username: form.username,
      }),
    );

    setIsLoading(true);

    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await completeDiscordInviteRegistration(
        {
          fullName: form.fullName,
          username: form.username,
        },
        data.session.access_token,
      );
      return;
    }

    const redirectTo = `${window.location.origin}/register?invite=teamnaturist&discordInvite=1`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        scopes: "identify email",
      },
    });

    if (error) {
      window.localStorage.removeItem("bareunity_pending_discord_invite");
      setStatus(error.message || "Could not start Discord registration.");
      setIsLoading(false);
    }
  }

  if (isInviteMode) {
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
            <span>BareUnity • Trusted partner invite</span>
          </p>
          <article className={styles.card}>
            <h1 className={styles.title}>Create your verified account</h1>
            <p className={styles.subtitle}>
              Your trusted partner has already completed age verification. Fill
              in only these invite details to create a verified BareUnity
              profile.
            </p>

            <form className={styles.form} onSubmit={onSubmit}>
              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <input
                  className={styles.input}
                  placeholder="Alex Morgan"
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fullName: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Username</span>
                <input
                  className={styles.input}
                  placeholder="nature-alex"
                  type="text"
                  value={form.username}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      username: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <div className={styles.stageBanner}>
                <strong>No invite code required.</strong> Discord registration checks
                your TeamNaturist server role directly with the bot, then records the
                Discord account in Supabase so the same Discord member cannot be used
                for repeated trusted-partner registrations.
              </div>

              <button
                className={styles.discordButton}
                type="button"
                onClick={() => void onDiscordInviteRegistration()}
                disabled={isLoading}
              >
                {isLoading ? "Opening Discord..." : "Register with Discord"}
              </button>

              {status ? <p className={styles.help}>{status}</p> : null}

              <p className={styles.alt}>
                Not using Discord?{" "}
                <Link className={styles.link} href="/register" prefetch={false}>
                  Use standard registration
                </Link>
              </p>
              <p className={styles.alt}>
                Already have an account?{" "}
                <Link className={styles.link} href="/login" prefetch={false}>
                  Sign in
                </Link>
              </p>
            </form>
          </article>
        </section>
      </main>
    );
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
          <span>BareUnity • Naturist Community</span>
        </p>
        <article className={styles.card}>
          <h1 className={styles.title}>
            Join safely and set your comfort level
          </h1>
          <p className={styles.subtitle}>
            Built for consent-first naturist connection. Start with a low-effort
            visitor pass, then choose ID verification later if you want full
            participation.
          </p>

          <form className={styles.form} onSubmit={onSubmit}>
            <p className={styles.sectionLabel}>A. Account setup</p>
            <label className={styles.field}>
              <span className={styles.label}>
                Email (for login and safety notices)
              </span>
              <input
                className={styles.input}
                placeholder="you@example.com"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                Display name (shown publicly)
              </span>
              <input
                className={styles.input}
                placeholder="NatureAlex"
                type="text"
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
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
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Confirm password</span>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        confirmPassword: event.target.value,
                      }))
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

            <p className={styles.sectionLabel}>B. Eligibility and membership</p>
            <label className={styles.field}>
              <span className={styles.label}>
                Legal full name (private, review-only)
              </span>
              <input
                className={styles.input}
                placeholder="Alex Morgan"
                type="text"
                value={form.fullName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullName: event.target.value }))
                }
                required
              />
            </label>

            <div className={styles.split}>
              <label className={styles.field}>
                <span className={styles.label}>Date of birth (18+ only)</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      dateOfBirth: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Country</span>
                <select
                  className={styles.select}
                  value={form.country}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      country: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select country
                  </option>
                  {COUNTRY_NAMES.map((countryName) => (
                    <option key={countryName} value={countryName}>
                      {countryName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Membership type</span>
              <select
                className={styles.select}
                value={form.membershipType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    membershipType: event.target.value,
                  }))
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

            <p className={styles.sectionLabel}>C. Choose your access level</p>
            <fieldset className={styles.choiceGrid}>
              <legend className={styles.label}>
                How would you like to join?
              </legend>
              <label
                className={`${styles.choiceCard} ${!isVerifiedApplication && !isInviteRegistration ? styles.choiceCardActive : ""}`}
              >
                <input
                  type="radio"
                  name="accountAccess"
                  value="viewOnly"
                  checked={!isVerifiedApplication && !isInviteRegistration}
                  onChange={() =>
                    setForm((prev) => ({
                      ...prev,
                      accountAccess: "viewOnly",
                      idType: "",
                      idDocument: null,
                      isSensitiveIdDetailsHidden: false,
                      motivation: "",
                      inviteCode: "",
                                        }))
                  }
                />
                <span>
                  <strong>7-day Visitor Pass</strong>
                  <small>
                    No ID upload is needed. Browse and preview the community for
                    7 days; posting, check-ins, and submissions stay locked
                    until ID verification.
                  </small>
                </span>
              </label>
              <label
                className={`${styles.choiceCard} ${isVerifiedApplication ? styles.choiceCardActive : ""}`}
              >
                <input
                  type="radio"
                  name="accountAccess"
                  value="verified"
                  checked={isVerifiedApplication}
                  onChange={() =>
                    setForm((prev) => ({
                      ...prev,
                      accountAccess: "verified",
                      inviteCode: "",
                                        }))
                  }
                />
                <span>
                  <strong>Verified with ID</strong>
                  <small>
                    Upload a government ID to unlock full member participation:
                    post, comment, like, check in, and submit places once
                    verification is complete.
                  </small>
                </span>
              </label>
            </fieldset>

            {!isVerifiedApplication ? (
              <div className={styles.trialBanner}>
                <strong>Your Visitor Pass includes 7 days of browsing.</strong>
                <span>
                  You can explore feeds, profiles, places, and community value.
                  To interact with members or publish content, switch to
                  Verified with ID anytime.
                </span>
              </div>
            ) : null}

            <p className={styles.sectionLabel}>D. Verification details</p>
            {isVerifiedApplication ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>
                    Government ID type for manual review
                  </span>
                  <select
                    className={styles.select}
                    value={form.idType}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        idType: event.target.value,
                      }))
                    }
                    required={isVerifiedApplication}
                  >
                    <option value="" disabled>
                      Choose ID type
                    </option>
                    <option>Passport</option>
                    <option>Driver&apos;s license</option>
                    <option>National ID card</option>
                  </select>
                </label>

                <div className={styles.field}>
                  <span className={styles.label}>
                    Upload government ID (JPG, PNG, WEBP, PDF • max 10MB)
                  </span>
                  <IdRedactionUploader
                    id="registrationIdDocument"
                    required={isVerifiedApplication}
                    onFileChange={(file) =>
                      setForm((prev) => ({
                        ...prev,
                        idDocument: file,
                      }))
                    }
                  />
                  <p className={styles.help}>
                    You can now cover sensitive details directly here before the
                    file is submitted. We only need your legal name, date of
                    birth, and the official ID seal/logo/header. Hide your
                    photo, document numbers, barcodes, MRZ lines, handwritten
                    signature, address, expiry, and all other details.
                  </p>
                </div>

                <div className={styles.redactionBox}>
                  <strong>Use the platform redaction tool first</strong>
                  <span>
                    For JPG, PNG, or WEBP files, drag black boxes over details
                    we do not need, then choose “Use redacted copy” so the
                    covered image is uploaded instead of the original.
                  </span>
                </div>

                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={form.isSensitiveIdDetailsHidden}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        isSensitiveIdDetailsHidden: event.target.checked,
                      }))
                    }
                    required={isVerifiedApplication}
                  />
                  <span>
                    I have hidden everything except my legal name, date of
                    birth, and the official ID seal/logo/header.
                  </span>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>
                    Why are you joining this community? (30+ chars)
                  </span>
                  <textarea
                    className={styles.textarea}
                    value={form.motivation}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        motivation: event.target.value,
                      }))
                    }
                    placeholder="Share your naturist values, boundaries, and what respectful participation means to you."
                    minLength={isVerifiedApplication ? 30 : undefined}
                    required={isVerifiedApplication}
                  />
                </label>
              </>
            ) : (
              <div className={styles.stageBanner}>
                <strong>View-only account selected.</strong> You will be able to
                browse the community after signing in, but posting, comments,
                likes, check-ins, and place submissions stay locked until you
                complete ID verification.
              </div>
            )}

            <p className={styles.sectionLabel}>E. Consent and policy</p>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isAdultConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isAdultConfirmed: event.target.checked,
                  }))
                }
                required
              />
              I confirm I am at least 18 years old and legally allowed to join
              in my country.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isConsentConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isConsentConfirmed: event.target.checked,
                  }))
                }
                required
              />
              I agree to consent-first conduct, no unsolicited sexual content,
              and respectful communication.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isPhotoRuleConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isPhotoRuleConfirmed: event.target.checked,
                  }))
                }
                required
              />
              I will never screenshot, download, or share another member&apos;s
              media without explicit consent.
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.isPolicyConfirmed}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isPolicyConfirmed: event.target.checked,
                  }))
                }
                required
              />
              I agree to BareUnity&apos;s Terms, Privacy Policy, and strict
              moderation guidelines available in the policies hub.
            </label>

            <button
              className={styles.button}
              type="submit"
              disabled={isLoading}
            >
              {isLoading
                ? "Submitting registration..."
                : isVerifiedApplication
                  ? "Create account and submit for review"
                  : "Start 7-day Visitor Pass"}
            </button>

            {status ? <p className={styles.help}>{status}</p> : null}

            <p className={styles.alt}>
              Have a trusted partner invite code?{" "}
              <Link className={styles.link} href="/register?invite" prefetch={false}>
                Register with invite code
              </Link>
            </p>
            <p className={styles.alt}>
              Already have an account?{" "}
              <Link className={styles.link} href="/login" prefetch={false}>
                Sign in
              </Link>
            </p>
            <p className={styles.legal}>
              Review the{" "}
              <Link className={styles.link} href="/policies" prefetch={false}>
                Privacy, Terms, Safety & Legal Policies
              </Link>{" "}
              before joining.
            </p>
          </form>
        </article>

        <p className={styles.legal}>
          {accountAccessLabel} keeps BareUnity consent-first: visitors can
          preview the community for 7 days, while member-impacting actions stay
          reserved for verified accounts.
        </p>
      </section>
    </main>
  );
}
