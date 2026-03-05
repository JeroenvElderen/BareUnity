"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

const tabs = ["Overview", "Posts", "Comments", "Saved", "History", "Upvoted"];

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const username = useMemo(() => {
    if (!user) return "Guest";
    return user.user_metadata?.username || user.email?.split("@")[0] || "Naturist";
  }, [user]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 px-4 py-6">
            <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-4">
                <div className="rounded-2xl border border-pine/20 bg-card/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sand/40 bg-pine text-xl font-bold text-sand">
                      {username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-sand">{username}</h1>
                      <p className="text-sm text-muted">u/{username}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab, index) => (
                    <button
                      key={tab}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        index === 0 ? "bg-sand text-pine" : "bg-card text-text/85 hover:bg-pine/80"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-pine/20 bg-card/80 p-4 text-sm text-sand">
                  👁️ Showing all content
                </div>

                <div className="rounded-2xl border border-pine/20 bg-card/60 p-10 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-pine text-3xl">👤</div>
                  <h2 className="text-4xl font-bold text-sand">You don&apos;t have any posts yet</h2>
                  <p className="mx-auto mt-2 max-w-xl text-lg text-muted">
                    Once you post to a community, it will show up here. If you&apos;d rather hide your posts, update your
                    settings.
                  </p>
                  <button className="mt-5 rounded-full bg-pine px-5 py-2 font-semibold text-sand hover:bg-pine-2">
                    Update Settings
                  </button>
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-pine/20 bg-card p-4">
                  <div className="mb-3 h-24 rounded-xl bg-gradient-to-r from-pine-2 to-pine" />
                  <h3 className="text-xl font-bold text-sand">{username}</h3>
                  <p className="text-sm text-muted">🌿 Living naturally and building a kind community.</p>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xl font-bold text-sand">1</p>
                      <p className="text-muted">Karma</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-sand">0</p>
                      <p className="text-muted">Contributions</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-sand">1d</p>
                      <p className="text-muted">Account age</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-sand">0</p>
                      <p className="text-muted">Active communities</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-pine/20 bg-card p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Settings</p>
                  <div className="space-y-2 text-sm">
                    {[
                      "Profile",
                      "Curate your profile",
                      "Avatar",
                      "Privacy tools",
                    ].map((item) => (
                      <div key={item} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-pine/30">
                        <span>{item}</span>
                        <button className="rounded-full bg-pine px-3 py-1 text-xs font-semibold text-sand">Update</button>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}