"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

const tabs = ["Overview", "Posts", "Comments", "Saved", "History", "Upvoted"];

type MediaPost = {
  id: string;
  media_url: string | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [mediaPosts, setMediaPosts] = useState<MediaPost[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMediaPosts([]);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    async function loadMedia() {
      const { data, error } = await supabase
        .from("posts")
        .select("id, media_url")
        .eq("author_id", userId)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        console.error(error);
        return;
      }

      setMediaPosts((data ?? []) as MediaPost[]);
    }

    loadMedia();
  }, [user]);

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

                <div className="rounded-2xl border border-pine/20 bg-card/70 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-sand">Profile media gallery</h2>
                    <span className="text-xs text-muted">Recent uploads</span>
                  </div>

                {mediaPosts.length === 0 ? (
                    <p className="text-sm text-muted">No media uploaded yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {mediaPosts.map((post) => (
                        <div key={post.id} className="overflow-hidden rounded-xl border border-sand/20 bg-pine/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={post.media_url ?? ""} alt="Profile media" className="h-32 w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-pine/20 bg-card p-4">
                  <div className="mb-3 h-24 rounded-xl bg-gradient-to-r from-pine-2 to-pine" />
                  <h3 className="text-xl font-bold text-sand">{username}</h3>
                  <p className="text-sm text-muted">🌿 Living naturally and building a kind community.</p>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}