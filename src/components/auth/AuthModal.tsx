"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Mode = "login" | "signup";

export default function AuthModal({ open, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const title = useMemo(() => (mode === "login" ? "Log in" : "Create account"), [mode]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
        return;
      }

      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // If you have email confirmation ON, user must confirm. If OFF, they’ll be logged in immediately.
      onClose();
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        aria-label="Close modal backdrop"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative w-[92vw] max-w-md rounded-xl border border-border bg-card shadow-soft p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-black/5">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-black/5 p-1">
          <button
            onClick={() => setMode("login")}
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === "login" ? "bg-card shadow-soft" : "text-muted"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === "signup" ? "bg-card shadow-soft" : "text-muted"
            }`}
          >
            Sign up
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-muted">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pine/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs text-muted">Password</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pine/40"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="w-full rounded-xl bg-pine px-3 py-2 text-sm text-white hover:bg-pine-2 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>

          <p className="text-xs text-muted">
            By continuing, you agree to follow community guidelines. No sexual content, no solicitation,
            consent required for identifiable photos.
          </p>
        </div>
      </div>
    </div>
  );
}