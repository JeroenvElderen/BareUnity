"use client";

export const dynamic = "force-dynamic";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

export default function ChannelsPage() {
  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-[min(72rem,calc(100vw-8.5rem))] rounded-3xl border border-accent/20 bg-card/50 p-6 text-sm text-muted">
            This page is intentionally empty for now.
          </div>
        </main>
      </div>
    </div>
  );
}
