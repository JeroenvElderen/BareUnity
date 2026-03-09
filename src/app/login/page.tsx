"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 text-text">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-accent/20 bg-bg/45 shadow-[0_36px_90px_-45px_rgba(2,10,30,1)] backdrop-blur-xl md:grid-cols-2">
        <div className="bg-gradient-to-br from-brand/25 via-card/25 to-brand-2/25 p-10">
          <p className="text-xs uppercase tracking-[0.24em] text-accent/80">Welcome back</p>
          <h1 className="mt-3 text-4xl font-semibold text-text">Return to your calm sanctuary.</h1>
          <p className="mt-4 text-sm text-muted">Reconnect with trusted naturist circles, thoughtful stories, and serene moments.</p>
        </div>

        <div className="bg-bg/40 p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-text">Login</h2>

          <div className="mt-6 space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full rounded-xl border border-accent/20 bg-white/5 p-3 text-text outline-none placeholder:text-muted focus:border-accent/35"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-xl border border-accent/20 bg-white/5 p-3 text-text outline-none placeholder:text-muted focus:border-accent/35"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button onClick={handleLogin} disabled={loading} className="premium-button w-full py-3 disabled:opacity-60">
              {loading ? "Logging in..." : "Log in"}
            </button>
          </div>

          <p className="mt-6 text-sm text-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-accent underline underline-offset-2">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
