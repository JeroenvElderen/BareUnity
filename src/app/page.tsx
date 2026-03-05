"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import CreatePost from "@/components/CreatePost";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Reddit-style topbar (search + login/signup modal) */}
      <Topbar />

      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          {/* Discord-style left sidebar */}
          <Sidebar />

          {/* Main feed column */}
          <main className="flex-1 px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {user && <CreatePost />}
              <Feed />
            </div>
          </main>

          {/* Optional Reddit-style right rail */}
          <aside className="hidden xl:block xl:w-80 xl:shrink-0 px-4 py-6">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="font-semibold mb-2">Popular Communities</div>
                <div className="space-y-2 text-sm text-text/90">
                  <div className="flex items-center justify-between">
                    <span>🌿 First Time Naturists</span>
                    <button className="text-xs rounded-lg px-2 py-1 bg-sand/40 hover:bg-sand/55">
                      Join
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>🏖 Beaches & Spots</span>
                    <button className="text-xs rounded-lg px-2 py-1 bg-sand/40 hover:bg-sand/55">
                      Join
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>📅 Events</span>
                    <button className="text-xs rounded-lg px-2 py-1 bg-sand/40 hover:bg-sand/55">
                      Join
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="font-semibold mb-2">Guidelines</div>
                <p className="text-sm text-muted">
                  Naturism-only. No explicit sexual content. Consent required for identifiable images.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}