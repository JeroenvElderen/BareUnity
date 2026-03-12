"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { Channel, getInitials, readChannelsFromSupabase } from "@/lib/channel-data";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      const rows = await readChannelsFromSupabase();
      if (isMounted) setChannels(rows);
    }

    loadChannels();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeChannel = useMemo(() => channels.find((channel) => channel.id === channelId) ?? null, [channels, channelId]);

  return (
    <div className="min-h-screen bg-[#030711] text-cyan-50">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-[min(72rem,calc(100vw-8.5rem))] space-y-4">
            <section className="rounded-3xl border border-accent/20 bg-card/55 p-4">
              {!activeChannel ? (
                <p className="text-sm text-muted">Channel not found.</p>
              ) : (
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
              )}
            </section>

            <section className="rounded-3xl border border-accent/20 bg-card/40 p-6 text-sm text-muted">This page is intentionally empty for now.</section>
          </div>
        </main>
      </div>
    </div>
  );
}
