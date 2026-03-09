"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ensureProfileExists } from "@/lib/profile";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await ensureProfileExists(data.user);
    }
    
    alert("Account created! Check your email.");
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 text-text">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-accent/20 bg-bg/45 shadow-[0_36px_90px_-45px_rgba(2,10,30,1)] backdrop-blur-xl md:grid-cols-2">
        <div className="bg-gradient-to-br from-brand-2/30 via-card/25 to-brand/25 p-10">
          <p className="text-xs uppercase tracking-[0.24em] text-accent/80">Create account</p>
          <h1 className="mt-3 text-4xl font-semibold text-text">Join BareUnity.</h1>
          <p className="mt-4 text-sm text-muted">Build your profile and discover curated naturist spaces designed for mindful living.</p>
        </div>

        <div className="bg-bg/40 p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-text">Sign up</h2>

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

            <button onClick={handleSignup} disabled={loading} className="premium-button w-full py-3 disabled:opacity-60">
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </div>

          <p className="mt-6 text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-2">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}