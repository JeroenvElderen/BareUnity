"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import ChannelContent from "@/components/channels/ChannelContent";
import { Channel, getInitials, readChannelsFromSupabase } from "@/lib/channel-data";

export default function ChannelsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      const rows = await readChannelsFromSupabase();
      if (isMounted) setChannels(rows);
    }

    void loadChannels();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedChannelId = searchParams.get("channel") ?? channels[0]?.id ?? null;
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? channels[0] ?? null,
    [channels, selectedChannelId],
  );

  function handleChannelSelect(channelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("channel", channelId);
    router.replace(`/channels?${params.toString()}`);
  }

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar onChannelSelect={handleChannelSelect} activeChannelId={activeChannel?.id} />

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-[min(72rem,calc(100vw-8.5rem))] space-y-4">
            {!activeChannel ? (
              <section className="rounded-3xl border border-accent/20 bg-card/50 p-6 text-sm text-muted">
                Select a channel from the sidebar to load its dedicated component here.
              </section>
            ) : (
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
