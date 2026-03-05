"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
  }

  if (user) {
    return (
      <button
        onClick={logout}
        className="rounded-xl border border-pine/20 bg-pine px-3 py-2 text-sm font-semibold text-sand transition hover:bg-pine-2"
      >
        Log out
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="rounded-xl border border-pine/25 bg-sand/40 px-4 py-2 text-sm font-semibold text-pine transition hover:bg-sand"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="rounded-xl border border-pine bg-pine px-4 py-2 text-sm font-semibold text-sand transition hover:bg-pine-2"
      >
        Sign up
      </Link>
    </div>
  );
}