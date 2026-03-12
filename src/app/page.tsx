"use client";

import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import CreatePost from "@/components/CreatePost";
import Feed from "@/components/Feed";
import ChannelContent from "@/components/channels/ChannelContent";
import { readStoredFeedView } from "@/lib/feed-preferences";
import { Channel, getInitials, readChannelsFromSupabase } from "@/lib/channel-data";

export default function Home() {
  const view = useMemo(() => readStoredFeedView(), []);
  const [showComposer, setShowComposer] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const isHomeSelected = activeChannelId === null;

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      const rows = await readChannelsFromSupabase();
      if (mounted) setChannels(rows);
    }

    void loadChannels();

    return () => {
      mounted = false;
    };
  }, []);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

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
            ) : activeChannel ? (
              <>
                <section className="rounded-3xl border border-accent/20 bg-card/55 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-accent/35 text-sm font-bold text-text">
                      {activeChannel.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeChannel.iconUrl} alt={`${activeChannel.name} icon`} className="h-full w-full object-cover" />
                      ) : (
                        getInitials(activeChannel.name)
                      )}
                    </div>
                    <h1 className="text-lg font-semibold text-text">{activeChannel.name}</h1>
                  </div>
                </section>
                <ChannelContent channelId={activeChannel.id} contentType={activeChannel.contentType} />
              </>
            ) : (
              <section className="rounded-3xl border border-accent/20 bg-card/50 p-6 text-sm text-muted">
                This channel is no longer available.
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
