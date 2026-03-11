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
    const { data, error } = await supabase.auth.signUp({ email, password });
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
      <section className="grid w-full max-w-6xl gap-4 md:grid-cols-[1fr_420px]">
        <div className="overflow-hidden rounded-3xl border border-accent/20 bg-card/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1400&auto=format&fit=crop" alt="Open sky" className="h-full min-h-[420px] w-full object-cover" />
        </div>

        <div className="rounded-3xl border border-accent/20 bg-card/60 p-6">
          <div className="space-y-4">
            <input type="email" placeholder="Email" className="w-full rounded-xl border border-accent/25 bg-card/55 p-3 text-text outline-none placeholder:text-muted" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Password" className="w-full rounded-xl border border-accent/25 bg-card/55 p-3 text-text outline-none placeholder:text-muted" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleSignup} disabled={loading} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-[#2a2f22]">{loading ? "Creating account..." : "Sign up"}</button>
          </div>
          <p className="mt-6 text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-accent underline">Log in</Link></p>
        </div>
      </section>
    </main>
  );
}
