"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import { COMMUNITY_STORAGE_KEY, Community, readStoredCommunities } from "@/lib/community-data";

export default function CommunityDetailPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const [communities, setCommunities] = useState<Community[]>(() => readStoredCommunities());
  const [textChannelDraft, setTextChannelDraft] = useState("");
  const [voiceChannelDraft, setVoiceChannelDraft] = useState("");
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [isPostNsfw, setIsPostNsfw] = useState(false);
  const [postTagDraft, setPostTagDraft] = useState("");
  const [postTags, setPostTags] = useState<string[]>([]);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  useEffect(() => {
    localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(communities));
  }, [communities]);

  const activeCommunity = useMemo(() => communities.find((community) => community.id === communityId) ?? null, [communities, communityId]);

  function addTextChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = textChannelDraft.trim();

    if (!activeCommunity || !value || activeCommunity.role === "member") {
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

    if (!activeCommunity || !value || activeCommunity.role === "member") {
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

  function addTag() {
    const value = postTagDraft.trim();
    if (!value || postTags.includes(value) || postTags.length > 4) {
      return;
    }

    setPostTags((current) => [...current, value]);
    setPostTagDraft("");
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCommunity || postTitle.trim().length < 3) {
      return;
    }

    setIsSubmittingPost(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      alert("You must be logged in to post.");
      setIsSubmittingPost(false);
      return;
    }

    let mediaUrl: string | null = null;
    if (postImage) {
      const filePath = `posts/${crypto.randomUUID()}-${postImage.name}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(filePath, postImage);

      if (uploadError) {
        console.error(uploadError);
        setIsSubmittingPost(false);
        return;
      }

      const { data } = supabase.storage.from("media").getPublicUrl(filePath);
      mediaUrl = data.publicUrl;
    }

    const payloadContent = [postBody.trim(), postTags.length ? `\n\nTags: ${postTags.join(", ")}` : "", isPostNsfw ? "\n\nNSFW" : ""]
      .join("")
      .trim();

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      community_id: activeCommunity.id,
      title: postTitle.trim(),
      content: payloadContent.length ? payloadContent : null,
      media_url: mediaUrl,
      post_type: mediaUrl ? "image" : "text",
    });

    if (error) {
      console.error(error);
      setIsSubmittingPost(false);
      return;
    }

    setIsSubmittingPost(false);
    setIsCreatePostOpen(false);
    setPostTitle("");
    setPostBody("");
    setPostImage(null);
    setIsPostNsfw(false);
    setPostTagDraft("");
    setPostTags([]);
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1">
          {!activeCommunity ? (
            <section className="rounded-2xl border border-dashed border-orange-300/30 bg-[#1a0d0b]/50 p-8 text-center text-orange-100/80">
              Community not found.
            </section>
          ) : (
            <section className="overflow-hidden border border-l-0 shadow-[0_40px_80px_-45px_rgba(0,0,0,0.9)]" style={{ borderColor: `${activeCommunity.theme.primary}66`, backgroundColor: activeCommunity.theme.secondary }}>
              <div
                className="h-32 bg-cover bg-center md:h-40"
                style={activeCommunity.bannerUrl ? { backgroundImage: `url(${activeCommunity.bannerUrl})` } : { background: `linear-gradient(105deg, ${activeCommunity.theme.primary}, ${activeCommunity.theme.secondary} 68%, #140908)` }}
              />
              <div className="border-b px-5 py-5 md:px-8" style={{ borderColor: `${activeCommunity.theme.primary}66` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-end gap-4">
                    <div className="-mt-14 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-[#210906] shadow-2xl md:h-28 md:w-28">
                      {activeCommunity.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeCommunity.logoUrl} alt={`${activeCommunity.name} logo`} className="h-full w-full object-cover" />
                      ) : (
                        <span
                          className="inline-flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-white"
                          style={{ backgroundColor: activeCommunity.theme.primary }}
                        >
                          Community
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-200/90">{activeCommunity.role}</p>
                      <h1 className="text-4xl font-extrabold text-white">r/{activeCommunity.name}</h1>
                      <p className="mt-1 max-w-3xl text-sm text-orange-100/80">{activeCommunity.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsCreatePostOpen(true)} className="rounded-full border px-4 py-2 text-sm font-semibold text-white" style={{ borderColor: `${activeCommunity.theme.primary}88` }}>+ Create Post</button>
                    <button className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Mod Tools</button>
                  </div>
                </div>
              </div>

              <div className="grid min-h-[calc(100vh-208px)] lg:grid-cols-[280px_1fr_320px]">
                <aside className="border-r border-[#5a2016] bg-[#170706]/95 p-4">
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
                      {activeCommunity.role !== "member" && (
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
                      {activeCommunity.role !== "member" && (
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
                  </div>
                </aside>

                <div className="border-r border-[#5a2016] bg-[#200905]/45 p-6">
                  <div className="min-h-[460px] rounded-2xl border border-[#633126] bg-[#2c0e09]/85 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <h2 className="mt-20 text-4xl font-bold text-slate-100">This community doesn&apos;t have any posts yet</h2>
                    <p className="mt-2 text-lg text-orange-200">Make one and get this feed started.</p>
                    <button onClick={() => setIsCreatePostOpen(true)} className="mt-6 rounded-full px-6 py-3 font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Create Post</button>
                  </div>
                </div>

                <aside className="space-y-3 bg-[#190705]/70 p-4">
                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h3 className="text-xl font-bold text-orange-50">{activeCommunity.name}</h3>
                    <p className="mt-2 text-sm text-orange-200/90">{activeCommunity.welcomeMessage ?? "Will be added"}</p>
                    <div className="mt-3 space-y-1 text-sm text-orange-100/95">
                      <p>🌐 {activeCommunity.privacy} • {activeCommunity.joinMode}</p>
                      <p>🔞 {activeCommunity.mature ? "Adult content" : "General"}</p>
                      <p>🏷️ {activeCommunity.tags.join(", ") || "No tags yet"}</p>
                      <p>📁 {activeCommunity.category ?? "No category"}</p>
                    </div>
                    <button className="mt-4 w-full rounded-full py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeCommunity.theme.primary }}>Community Guide</button>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Community rules</h4>
                    <ol className="mt-3 space-y-2 text-sm text-orange-100">
                      {activeCommunity.rules.map((rule, index) => (
                        <li key={rule}>{index + 1}. {rule}</li>
                      ))}
                    </ol>
                    {activeCommunity.announcement && <p className="mt-3 rounded bg-black/30 px-2 py-1 text-xs text-orange-200">📢 {activeCommunity.announcement}</p>}
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Community systems</h4>
                    <p className="mt-2 text-xs text-orange-100">Featured, verification, leaderboards, wiki, file library, event board, member directory, polls, milestones, highlights, and moderators chat are now scaffolded in the schema update plan.</p>
                  </section>
                </aside>
              </div>
            </section>
          )}

          {activeCommunity && isCreatePostOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
              <div className="w-full max-w-4xl rounded-2xl border border-slate-300/20 bg-[#0f141b] p-6 text-slate-100 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-4xl font-bold text-slate-100">Create post</h3>
                  <button onClick={() => setIsCreatePostOpen(false)} className="rounded-full border border-slate-400/40 px-3 py-1 text-sm" type="button">✕</button>
                </div>
                <p className="text-sm text-slate-300">r/{activeCommunity.name}</p>

                <form onSubmit={submitPost} className="mt-5 space-y-4">
                  <div className="flex gap-6 border-b border-slate-500/30 pb-2 text-lg font-semibold">
                    <p className="border-b-2 border-blue-400 pb-2">Post</p>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 text-pink-300">
                      <input type="checkbox" checked={isPostNsfw} onChange={(event) => setIsPostNsfw(event.target.checked)} /> NSFW
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={postTagDraft}
                        onChange={(event) => setPostTagDraft(event.target.value)}
                        placeholder="Add tag"
                        className="rounded-full border border-slate-400/30 bg-black/40 px-3 py-1 text-xs"
                      />
                      <button type="button" onClick={addTag} className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold">Add</button>
                    </div>
                    {postTags.length > 0 && <p className="text-xs text-slate-300">{postTags.join(" • ")}</p>}
                  </div>

                  <input
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                    maxLength={300}
                    required
                    placeholder="Title*"
                    className="w-full rounded-2xl border border-slate-400/30 bg-transparent px-4 py-3 text-lg"
                  />

                  <div className="rounded-2xl border border-dashed border-slate-400/30 bg-slate-900/40 p-5">
                    <label className="text-sm text-slate-300">Image (optional)</label>
                    <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(event) => setPostImage(event.target.files?.[0] ?? null)} />
                  </div>

                  <textarea
                    value={postBody}
                    onChange={(event) => setPostBody(event.target.value)}
                    placeholder="Body text (optional)"
                    rows={8}
                    className="w-full rounded-2xl border border-slate-400/30 bg-transparent p-4"
                  />

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsCreatePostOpen(false)} className="rounded-full border border-slate-500/40 px-5 py-2 text-sm">Cancel</button>
                    <button type="submit" disabled={isSubmittingPost} className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSubmittingPost ? "Posting..." : "Post"}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
