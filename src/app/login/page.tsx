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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-pine">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-pine/20 bg-card shadow-soft md:grid-cols-2">
        <div className="bg-pine p-8 text-sand">
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="mt-3 text-sm text-sand/90">
            Log in to continue sharing your naturist experiences.
          </p>
        </div>

        <div className="bg-sand p-8">
          <h2 className="text-2xl font-bold text-pine">Log in</h2>

          <div className="mt-6 space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-pine/20 bg-sand-2/20 p-3 text-pine outline-none placeholder:text-pine/50 focus:ring-2 focus:ring-pine/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-lg border border-pine/20 bg-sand-2/20 p-3 text-pine outline-none placeholder:text-pine/50 focus:ring-2 focus:ring-pine/30"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-lg bg-pine py-3 font-semibold text-sand transition hover:bg-pine-2 disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Log in"}
            </button>
          </div>

          <p className="mt-6 text-sm text-pine/80">
            New here?{" "}
            <Link href="/signup" className="font-semibold underline">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
