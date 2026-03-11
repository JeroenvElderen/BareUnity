"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { useMemo, useState } from "react";
import CreatePost from "@/components/CreatePost";
import Feed from "@/components/Feed";
import { readStoredFeedView } from "@/lib/feed-preferences";

export default function Home() {
  const view = useMemo(() => readStoredFeedView(), []);
  const [showComposer, setShowComposer] = useState(false);

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="mx-auto max-w-[1500px]">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowComposer((current) => !current)}
                  className={`glass-pill rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] shadow-[0_12px_28px_-18px_rgba(75,212,196,0.95)] transition ${
                    showComposer ? "border-accent/65 bg-accent/70 text-[#0f2f36]" : "text-accent"
                  }`}
                >
                  {showComposer ? "Hide create post" : "Create post"}
                </button>
              </div>

              {showComposer && <CreatePost />}
              <Feed view={view} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
