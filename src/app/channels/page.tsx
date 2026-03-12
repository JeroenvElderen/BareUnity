"use client";

export const dynamic = "force-dynamic";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { Channel } from "@/lib/channel-data";
import { useState } from "react";

export default function ChannelsPage() {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar selectedChannelId={selectedChannel?.id ?? null} onChannelSelect={setSelectedChannel} />

        <main className={`min-w-0 flex-1 px-4 py-6 md:px-6 ${selectedChannel ? "hidden" : ""}`}>
          <div className="mx-auto w-full max-w-[min(72rem,calc(100vw-8.5rem))] rounded-3xl border border-accent/20 bg-card/50 p-6 text-sm text-muted">
            This page is intentionally empty for now.
          </div>
        </main>
      </div>
    </div>
  );
}
