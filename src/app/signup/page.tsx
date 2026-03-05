"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if  (error){
      alert(error.message)
      setLoading(false)
      return;
    }

    alert("Account created! Check your email.")
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8 text-pine">
        <section className="grid w-full max-w-4x1 overflow-hidden rounded-2x1 border border-pine/20 bg-card shadow-soft md:grid-cols-2">
            <div className="bg-pine p-8 text-sand">
                <h1 className="text-3x1 font-bold">Join the community</h1>
                <p className="mt-3 text-sm text-sand/90">Set up your account and start posting in your favorite circles.</p>
            </div>

            <div className="bg-sand p-8">
                <h2 className="text-2x1 font-bold text-pine">Create account</h2>
                
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
                        onClick={handleSignup}
                        disabled={loading}
                        className="w-full rounded-lg bg-pine py-3 font-semibold text-sand transition hover:bg-pine-2 disabled:opacity-60"
                    >
                        {loading ? "Creating account..." : "Sign up"}
                    </button>
                </div>

                <p className="mt-6 text-sm text-pine/80">
                Already have an account ? <Link href="/login" className="font-semibold underline">Log in</Link>
                </p>
            </div>
        </section>
    </main>
  );
}