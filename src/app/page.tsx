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

          <main className="flex-1 px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              <CreatePost />
              <Feed />
            </div>
          </main>

          <aside className="hidden px-4 py-6 xl:block xl:w-80 xl:shrink-0">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-2xl border border-sand/20 bg-card/70 p-4 shadow-[0_18px_45px_-35px_rgba(0,0,0,0.9)] backdrop-blur">
                <div className="mb-2 font-semibold text-sand">Popular Communities</div>
                <div className="space-y-2 text-sm text-text/90">
                  <div className="flex items-center justify-between">
                    <span>🌿 First Time Naturists</span>
                    <button className="rounded-lg border border-sand/25 bg-sand/15 px-2 py-1 text-xs transition hover:bg-sand/30">Join</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>🏖 Beaches & Spots</span>
                    <button className="rounded-lg border border-sand/25 bg-sand/15 px-2 py-1 text-xs transition hover:bg-sand/30">Join</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>📅 Events</span>
                    <button className="rounded-lg border border-sand/25 bg-sand/15 px-2 py-1 text-xs transition hover:bg-sand/30">Join</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sand/20 bg-card/70 p-4 shadow-[0_18px_45px_-35px_rgba(0,0,0,0.9)] backdrop-blur">
                <div className="mb-2 font-semibold text-sand">Guidelines</div>
                <p className="text-sm text-text/80">
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