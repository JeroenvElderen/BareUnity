"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import AuthModal from "./AuthModal";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

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
        className="rounded-xl px-3 py-2 text-sm border border-border bg-card hover:bg-black/5"
      >
        Log out
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl px-3 py-2 text-sm text-white bg-pine hover:bg-pine-2 shadow-soft"
      >
        Log in
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}