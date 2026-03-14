"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureProfileExists } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { getUsernameValidationMessage, normalizeUsername } from "@/lib/username";

type Intent = "reader" | "poster" | "organizer" | "creator";

type AvailabilityResponse = {
  username: string;
  available: boolean;
  message?: string;
  suggestions?: string[];
};

const onboardingIntents: Array<{ id: Intent; title: string; description: string }> = [
  { id: "reader", title: "Reader", description: "Discover channels and follow conversations." },
  { id: "poster", title: "Poster", description: "Share updates, moments, and discussions." },
  { id: "organizer", title: "Organizer", description: "Coordinate events and guide communities." },
  { id: "creator", title: "Creator", description: "Build original series and long-form content." },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState<Intent>("reader");
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
          intent,
        },
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await ensureProfileExists(data.user);
    }
    alert("Account created! Check your email to confirm.");
    router.push("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 text-text">
      <section className="grid w-full gap-6 md:grid-cols-[1fr_460px]">
        <div className="glass-card-strong overflow-hidden p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-accent/80">Onboarding</p>
          <h1 className="mt-4 text-3xl font-semibold">Set up your account in a few guided steps.</h1>
          <p className="mt-4 max-w-lg text-sm text-muted">Choose how you want to use BareUnity first. We&apos;ll tailor your start experience around your intent so the feed and prompts feel relevant from day one.</p>

          <div className="mt-8 space-y-3 text-sm">
            {["Account", "Intent", "Username"].map((label, index) => {
              const isActive = step === index + 1;
              const isComplete = step > index + 1;
              return (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-accent/20 bg-bg/35 px-3 py-2">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isComplete ? "bg-brand text-[#10262a]" : isActive ? "bg-accent/40 text-text" : "bg-card text-muted"}`}>
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
                Continue to intent
              </button>

              <p className="text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-accent underline">Log in</Link></p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">What brings you here?</h2>
              <p className="text-sm text-muted">Pick your primary intent. You can change this later in settings.</p>

              <div className="grid grid-cols-1 gap-2">
                {onboardingIntents.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setIntent(entry.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${intent === entry.id ? "border-accent/60 bg-accent/18" : "border-accent/25 bg-bg/35 hover:border-accent/45"}`}
                  >
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-sm text-muted">{entry.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button className="soft-button flex-1" onClick={() => setStep(1)}>Back</button>
                <button className="premium-button flex-1" onClick={() => setStep(3)}>Continue to username</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Choose your username</h2>
              <p className="text-sm text-muted">This will be shown publicly. Based on your intent: <span className="font-medium text-text">{intent}</span>.</p>

              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nature-walker"
                  className="glass-input w-full rounded-xl px-3 py-3 text-text placeholder:text-muted outline-none ring-0 focus:border-accent/45"
                />
                <p className="mt-1 text-xs text-muted">Preview: @{normalizedUsername || "your-name"}</p>
              </div>

              {usernameValidationMessage && <p className="text-xs text-amber-300">{usernameValidationMessage}</p>}
              {!usernameValidationMessage && checkingUsername && <p className="text-xs text-muted">Checking availability…</p>}
              {!usernameValidationMessage && availability?.message && (
                <p className={`text-xs ${availability.available ? "text-emerald-300" : "text-amber-300"}`}>{availability.message}</p>
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
