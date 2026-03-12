"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { useMemo, useState } from "react";
import CreatePost from "@/components/CreatePost";
import Feed from "@/components/Feed";
import ChannelContent from "@/components/channels/ChannelContent";
import { readStoredFeedView } from "@/lib/feed-preferences";

export default function Home() {
  const view = useMemo(() => readStoredFeedView(), []);
  const [showComposer, setShowComposer] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const isHomeSelected = activeChannelId === null;

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar
          isHomeActive={isHomeSelected}
          onHomeSelect={() => {
            setActiveChannelId(null);
            setShowComposer(false);
          }}
          onChannelSelect={(channelId) => {
            setActiveChannelId(channelId);
            setShowComposer(false);
          }}
          activeChannelId={activeChannelId ?? undefined}
          channelFilter={(channel) => channel.id === "naturist-map" || channel.contentType === "map"}
        />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-[min(72rem,calc(100vw-8.5rem))] space-y-4">
            {isHomeSelected ? (
              <>
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
              </>
            ) : (
              <ChannelContent channelId={activeChannelId} contentType="map" />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
