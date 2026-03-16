"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  function getSafeNextPath() {
    const nextPath = searchParams.get("next") || "/";
    return nextPath.startsWith("/") ? nextPath : "/";
  }

  async function handleLogin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!isSupabaseConfigured) {
      alert("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert(error.message);
        return;
      }

      const nextPath = getSafeNextPath();
      window.location.assign(nextPath);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 text-text">
      <section className="grid w-full gap-6 md:grid-cols-[1fr_420px]">
        <div className="glass-card-strong p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-accent/80">Welcome back</p>
          <h1 className="mt-4 text-3xl font-semibold">Pick up where your community left off.</h1>
          <p className="mt-4 max-w-lg text-sm text-muted">
            Log in to continue exploring channels, joining conversations, and managing your profile with the same BareUnity visual system as the rest of the app.
          </p>
          <div className="mt-8 rounded-2xl border border-accent/20 bg-bg/30 p-4 text-sm text-muted">
            <p>Quick tip: if you just created an account, check your email confirmation first before logging in.</p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-7">
          <h2 className="text-xl font-semibold">Log in</h2>
          <p className="mt-2 text-sm text-muted">Enter your account credentials.</p>

          <form className="mt-5 space-y-3" onSubmit={handleLogin}>
            <input
              suppressHydrationWarning
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="glass-input w-full rounded-xl px-3 py-3 text-text outline-none placeholder:text-muted focus:border-accent/45"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              suppressHydrationWarning
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className="glass-input w-full rounded-xl px-3 py-3 text-text outline-none placeholder:text-muted focus:border-accent/45"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!isSupabaseConfigured ? (
              <p className="text-sm text-accent">Authentication is not configured in this environment.</p>
            ) : null}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={loading || !email || !password || !isSupabaseConfigured}
              className="premium-button w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>
          
          <p className="mt-6 text-sm text-muted">
            New here? <Link href={`/signup?next=${encodeURIComponent(getSafeNextPath())}`} className="font-semibold text-accent underline">Create an account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
