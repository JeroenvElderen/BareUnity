"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { COMMUNITY_STORAGE_KEY, Community, readStoredCommunities } from "@/lib/community-data";

export default function CommunityDetailPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const [communities, setCommunities] = useState<Community[]>(() => readStoredCommunities());
  const [textChannelDraft, setTextChannelDraft] = useState("");
  const [voiceChannelDraft, setVoiceChannelDraft] = useState("");

  useEffect(() => {
    localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(communities));
  }, [communities]);

  const activeCommunity = useMemo(() => communities.find((community) => community.id === communityId) ?? null, [communities, communityId]);

  function addTextChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = textChannelDraft.trim();

    if (!activeCommunity || !value || activeCommunity.role !== "owner") {
      return;
    }

    setCommunities((current) =>
      current.map((community) =>
        community.id === activeCommunity.id && !community.textChannels.includes(value)
          ? { ...community, textChannels: [...community.textChannels, value] }
          : community,
      ),
    );

    setTextChannelDraft("");
  }

  function addVoiceChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = voiceChannelDraft.trim();

    if (!activeCommunity || !value || activeCommunity.role !== "owner") {
      return;
    }

    setCommunities((current) =>
      current.map((community) =>
        community.id === activeCommunity.id && !community.voiceChannels.includes(value)
          ? { ...community, voiceChannels: [...community.voiceChannels, value] }
          : community,
      ),
    );

    setVoiceChannelDraft("");
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1 p-3 md:p-5">
          {!activeCommunity ? (
            <section className="rounded-2xl border border-dashed border-orange-300/30 bg-[#1a0d0b]/50 p-8 text-center text-orange-100/80">
              Community not found.
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border" style={{ borderColor: `${activeCommunity.theme.primary}77`, backgroundColor: activeCommunity.theme.secondary }}>
              <div className="h-32" style={{ background: `linear-gradient(90deg, ${activeCommunity.theme.primary}, ${activeCommunity.theme.secondary})` }} />
              <div className="border-b px-4 py-4 md:px-6" style={{ borderColor: `${activeCommunity.theme.primary}66` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-200/90">{activeCommunity.role}</p>
                    <h1 className="text-4xl font-extrabold text-white">r/{activeCommunity.name}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-orange-100/80">{activeCommunity.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-full border px-4 py-2 text-sm font-semibold text-white" style={{ borderColor: `${activeCommunity.theme.primary}88` }}>+ Create Post</button>
                    <button className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Mod Tools</button>
                  </div>
                </div>
              </div>

              <div className="grid min-h-[600px] lg:grid-cols-[270px_1fr_300px]">
                <aside className="border-r border-[#5a2016] bg-[#180807] p-3">
                  <div className="space-y-3">
                    <section className="rounded-lg border border-[#653022] bg-[#2b0f0a] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-orange-200">Text Channels</div>
                      <div className="space-y-1">
                        {activeCommunity.textChannels.map((channel) => (
                          <div key={channel} className="rounded-md bg-black/35 px-2 py-1 text-sm text-orange-50">
                            # {channel}
                          </div>
                        ))}
                      </div>
                      {activeCommunity.role === "owner" && (
                        <form onSubmit={addTextChannel} className="mt-2 flex gap-1">
                          <input
                            value={textChannelDraft}
                            onChange={(event) => setTextChannelDraft(event.target.value)}
                            placeholder="new-text-channel"
                            className="w-full rounded border border-orange-300/25 bg-black/40 px-2 py-1 text-xs outline-none"
                          />
                          <button type="submit" className="rounded bg-orange-600 px-2 text-xs font-semibold text-white hover:bg-orange-500">
                            +
                          </button>
                        </form>
                      )}
                    </section>

                    <section className="rounded-lg border border-[#653022] bg-[#2b0f0a] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-orange-200">Voice Channels</div>
                      <div className="space-y-1">
                        {activeCommunity.voiceChannels.map((channel) => (
                          <div key={channel} className="rounded-md bg-black/35 px-2 py-1 text-sm text-orange-50">
                            🔊 {channel}
                          </div>
                        ))}
                      </div>
                      {activeCommunity.role === "owner" && (
                        <form onSubmit={addVoiceChannel} className="mt-2 flex gap-1">
                          <input
                            value={voiceChannelDraft}
                            onChange={(event) => setVoiceChannelDraft(event.target.value)}
                            placeholder="new-voice-channel"
                            className="w-full rounded border border-orange-300/25 bg-black/40 px-2 py-1 text-xs outline-none"
                          />
                          <button type="submit" className="rounded bg-orange-600 px-2 text-xs font-semibold text-white hover:bg-orange-500">
                            +
                          </button>
                        </form>
                      )}
                    </section>

                    <section className="rounded-lg border border-[#653022] bg-[#2b0f0a] p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-orange-200">Admin Channels</div>
                      <p className="text-sm text-orange-50">⚙ community-settings</p>
                      <p className="mt-1 text-sm text-orange-50">🛡 moderation-queue</p>
                    </section>
                  </div>
                </aside>

                <div className="border-r border-[#5a2016] p-5">
                  <div className="min-h-[420px] rounded-xl border border-[#633126] bg-[#2c0e09]/85 p-6 text-center">
                    <h2 className="mt-20 text-4xl font-bold text-slate-100">This community doesn&apos;t have any posts yet</h2>
                    <p className="mt-2 text-lg text-orange-200">Make one and get this feed started.</p>
                    <button className="mt-6 rounded-full px-6 py-3 font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Create Post</button>
                  </div>
                </div>

                <aside className="space-y-3 p-3">
                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h3 className="text-xl font-bold text-orange-50">{activeCommunity.name}</h3>
                    <p className="mt-2 text-sm text-orange-200/90">Will be added</p>
                    <div className="mt-3 space-y-1 text-sm text-orange-100/95">
                      <p>🌐 {activeCommunity.privacy}</p>
                      <p>🔞 {activeCommunity.mature ? "Adult content" : "General"}</p>
                    </div>
                    <button className="mt-4 w-full rounded-full py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Community Guide</button>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">r/{activeCommunity.name.toUpperCase()} Rules</h4>
                    <ol className="mt-3 space-y-2 text-sm text-orange-100">
                      <li>1. Respect others and be civil</li>
                      <li>2. No spam</li>
                    </ol>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Moderators</h4>
                    <button className="mt-3 w-full rounded-full py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Message Mods</button>
                    <p className="mt-3 text-sm text-orange-100">u/JeroenTheNaturist</p>
                  </section>
                </aside>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
