"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureProfileExists } from "@/lib/profile";
import { DEFAULT_ROLE, PROFILE_INTERESTS, USER_ROLES, type ProfileInterest, type UserRole } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { getUsernameValidationMessage, normalizeUsername } from "@/lib/username";

type AvailabilityResponse = {
  username: string;
  available: boolean;
  message?: string;
  suggestions?: string[];
};

const roleDescriptions: Record<UserRole, string> = {
  newcomer: "Default starter role with newcomer-safe channel settings.",
  organizer: "Can help coordinate official gatherings and schedules.",
  traveler: "Great for people who post travel updates and naturist spots.",
  mentor: "Community guides focused on support and respectful orientation.",
  club_admin: "Operational role for club and moderation administration.",
};

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role] = useState<UserRole>(DEFAULT_ROLE);
  const [interests, setInterests] = useState<ProfileInterest[]>([]);
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const usernameValidationMessage = useMemo(() => getUsernameValidationMessage(normalizedUsername), [normalizedUsername]);

  useEffect(() => {
    if (!normalizedUsername || usernameValidationMessage) {
      setAvailability(null);
      return;
    }

    const controller = new AbortController();
    setCheckingUsername(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/username-availability?username=${encodeURIComponent(normalizedUsername)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to check username");
        }

        const payload = (await response.json()) as AvailabilityResponse;
        setAvailability(payload);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
          setAvailability({ username: normalizedUsername, available: false, message: "Could not check username right now." });
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingUsername(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      setCheckingUsername(false);
    };
  }, [normalizedUsername, usernameValidationMessage]);

  function getSafeNextPath() {
    const nextPath = searchParams.get("next") || "/";
    return nextPath.startsWith("/") ? nextPath : "/";
  }

  function toggleInterest(interest: ProfileInterest) {
    setInterests((current) => current.includes(interest) ? current.filter((entry) => entry !== interest) : [...current, interest]);
  }

  async function handleSignup() {
    if (usernameValidationMessage) {
      alert(usernameValidationMessage);
      return;
    }

    if (!availability?.available) {
      alert("Please choose an available username.");
      return;
    }

    setLoading(true);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
          role,
          interests,
          onboarding_completed: true,
        },
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await ensureProfileExists(data.user, { role, interests });
    }

    alert("Account created! Check your email to confirm.");
    router.push(`/login?next=${encodeURIComponent(getSafeNextPath())}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 text-text">
      <section className="grid w-full gap-6 md:grid-cols-[1fr_460px]">
        <div className="glass-card-strong overflow-hidden p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-accent/80">Guided onboarding</p>
          <h1 className="mt-4 text-3xl font-semibold">Set up your account in a few guided steps.</h1>
          <p className="mt-4 max-w-lg text-sm text-muted">This platform is channel-first for naturists and nudists. Role starts as newcomer and elevated roles can only be assigned by platform admin.</p>

          <div className="mt-8 space-y-3 text-sm">
            {["Account", "Role", "Interests + Username"].map((label, index) => {
              const isActive = step === index + 1;
              const isComplete = step > index + 1;
              return (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-accent/20 bg-bg/35 px-3 py-2">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isComplete ? "bg-brand text-text-inverse" : isActive ? "bg-accent/40 text-text" : "bg-card text-muted"}`}>
                    {isComplete ? "✓" : index + 1}
                  </span>
                  <span className={isActive ? "text-text" : "text-muted"}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card p-6 md:p-7">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Create your account</h2>
              <p className="text-sm text-muted">Use your email and a secure password to start.</p>

              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="glass-input w-full rounded-xl px-3 py-3 text-text placeholder:text-muted outline-none ring-0 focus:border-accent/45" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" className="glass-input w-full rounded-xl px-3 py-3 text-text placeholder:text-muted outline-none ring-0 focus:border-accent/45" />

              <button className="premium-button w-full" onClick={() => setStep(2)} disabled={!email || password.length < 6}>
                Continue to role
              </button>

              <p className="text-sm text-muted">Already have an account? <Link href={`/login?next=${encodeURIComponent(getSafeNextPath())}`} className="font-semibold text-accent underline">Log in</Link></p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Role selection</h2>
              <p className="text-sm text-muted">Newcomer is the standard role. Other roles are visible, but can only be assigned by the platform admin.</p>

              <div className="grid grid-cols-1 gap-2">
                {USER_ROLES.map((entry) => {
                  const isDefault = entry === DEFAULT_ROLE;
                  return (
                    <div
                      key={entry}
                      className={`rounded-xl border px-4 py-3 text-left ${isDefault ? "border-accent/60 bg-accent/18" : "border-accent/20 bg-bg/20 opacity-70"}`}
                    >
                      <p className="font-medium capitalize">{entry.replace("_", " ")}{!isDefault ? " (admin only)" : ""}</p>
                      <p className="text-sm text-muted">{roleDescriptions[entry]}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button className="soft-button flex-1" onClick={() => setStep(1)}>Back</button>
                <button className="premium-button flex-1" onClick={() => setStep(3)}>Continue</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Choose interests and username</h2>

              <div>
                <p className="mb-2 text-sm text-muted">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_INTERESTS.map((interest) => {
                    const active = interests.includes(interest);
                    return (
                      <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full px-3 py-1 text-xs capitalize ${active ? "bg-accent text-text-inverse" : "border border-accent/30"}`}>
                        {interest}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nature-walker"
                  className="glass-input w-full rounded-xl px-3 py-3 text-text placeholder:text-muted outline-none ring-0 focus:border-accent/45"
                />
                <p className="mt-1 text-xs text-muted">Preview: @{normalizedUsername || "your-name"} · role: newcomer</p>
              </div>

              {usernameValidationMessage && <p className="text-xs text-accent">{usernameValidationMessage}</p>}
              {!usernameValidationMessage && checkingUsername && <p className="text-xs text-muted">Checking availability…</p>}
              {!usernameValidationMessage && availability?.message && (
                <p className={`text-xs ${availability.available ? "text-accent" : "text-accent"}`}>{availability.message}</p>
              )}

              {!!availability?.suggestions?.length && !availability.available && (
                <div className="rounded-xl border border-accent/20 bg-bg/35 p-3">
                  <p className="text-xs text-muted">Try one of these:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availability.suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" className="glass-pill rounded-full px-3 py-1 text-xs" onClick={() => setUsername(suggestion)}>
                        @{suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button className="soft-button flex-1" onClick={() => setStep(2)} disabled={loading}>Back</button>
                <button className="premium-button flex-1" onClick={handleSignup} disabled={loading || !availability?.available}>
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
