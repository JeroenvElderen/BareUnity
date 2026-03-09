"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import CreatePost from "@/components/CreatePost";

export default function Home() {
  return (
    <div className="min-h-screen text-text">
      <Topbar />

      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 px-4 py-6 md:px-6">
            <section className="glass-card mb-6 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-accent/80">BareUnity social lounge</p>
              <h1 className="mt-2 text-3xl font-semibold text-text md:text-4xl">A premium, calm social space.</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Discover communities, share stories, and connect with people who value authenticity, wellness, and freedom.
              </p>
            </section>

            <div className="mx-auto max-w-2xl space-y-6">
              <CreatePost />
              <Feed />
            </div>
          </main>

          <aside className="hidden px-4 py-6 xl:block xl:w-80 xl:shrink-0">
            <div className="sticky top-20 space-y-4">
              <div className="glass-card p-4">
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">Trending circles</div>
                <div className="space-y-2 text-sm text-text">
                  <div className="flex items-center justify-between rounded-xl border border-accent/15 bg-white/5 px-3 py-2">
                    <span>🌿 First Time Naturists</span>
                    <button className="soft-button px-2 py-1 text-xs">Join</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-accent/15 bg-white/5 px-3 py-2">
                    <span>🏖 Beaches & Spots</span>
                    <button className="soft-button px-2 py-1 text-xs">Join</button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-accent/15 bg-white/5 px-3 py-2">
                    <span>📅 Events</span>
                    <button className="soft-button px-2 py-1 text-xs">Join</button>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">House rules</div>
                <p className="text-sm text-muted">Be respectful, keep content consensual, and post only non-explicit naturism-focused media.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}