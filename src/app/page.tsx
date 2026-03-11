"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import CreatePost from "@/components/CreatePost";
import Feed, { FeedView } from "@/components/Feed";

export default function Home() {
  const [view, setView] = useState<FeedView>("balanced");
  const [showComposer, setShowComposer] = useState(false);

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="mx-auto max-w-[1500px]">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-6xl space-y-4">
              <section className="glass-card p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted">Feed style</p>
                  <button
                    type="button"
                    onClick={() => setView("balanced")}
                    className={`glass-pill rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      view === "balanced" ? "border-accent/65 bg-accent/70 text-[#0f2f36]" : "text-accent"
                    }`}
                  >
                    Pinterest Balanced
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("magazine")}
                    className={`glass-pill rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      view === "magazine" ? "border-accent/65 bg-accent/70 text-[#0f2f36]" : "text-accent"
                    }`}
                  >
                    Magazine Zigzag
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowComposer((current) => !current)}
                    className={`glass-pill ml-auto rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      showComposer ? "border-accent/65 bg-accent/70 text-[#0f2f36]" : "text-accent"
                    }`}
                  >
                    {showComposer ? "Hide create post" : "Create post"}
                  </button>
                </div>
              </section>

              {showComposer && <CreatePost />}
              <Feed view={view} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
