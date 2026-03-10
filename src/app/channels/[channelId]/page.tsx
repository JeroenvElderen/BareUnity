"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import { CHANNEL_WORKSPACE_STORAGE_KEY, ChannelWorkspace, readStoredChannelWorkspaces } from "@/lib/channel-data";

export default function ChannelWorkspacePage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channelWorkspaces, setChannelWorkspaces] = useState<ChannelWorkspace[]>(() => readStoredChannelWorkspaces());

  const [textChannelDraft, setTextChannelDraft] = useState("");
  const [voiceChannelDraft, setVoiceChannelDraft] = useState("");

  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [isPostMature, setIsPostMature] = useState(false);
  const [postTagDraft, setPostTagDraft] = useState("");
  const [postTags, setPostTags] = useState<string[]>([]);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  const [ruleDraft, setRuleDraft] = useState("");
  const [flairLabel, setFlairLabel] = useState("");
  const [flairColor, setFlairColor] = useState("#f97316");
  const [autoRuleName, setAutoRuleName] = useState("");
  const [autoRuleKeyword, setAutoRuleKeyword] = useState("");
  const [autoRuleAction, setAutoRuleAction] = useState<"flag" | "remove">("flag");

  useEffect(() => {
    localStorage.setItem(CHANNEL_WORKSPACE_STORAGE_KEY, JSON.stringify(channelWorkspaces));
  }, [channelWorkspaces]);

  const activeChannelWorkspace = useMemo(() => channelWorkspaces.find((workspace) => workspace.id === channelId) ?? null, [channelWorkspaces, channelId]);
  const canManageChannelWorkspace = activeChannelWorkspace?.role === "owner";

  function updateChannelWorkspace(updater: (workspace: ChannelWorkspace) => ChannelWorkspace) {
    if (!activeChannelWorkspace) {
      return;
    }

    setChannelWorkspaces((current) => current.map((workspace) => (workspace.id === activeChannelWorkspace.id ? updater(workspace) : workspace)));
  }

  function addTextChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = textChannelDraft.trim();
    if (!activeChannelWorkspace || !value || activeChannelWorkspace.role === "member") {
      return;
    }

    updateChannelWorkspace((workspace) => {
      if (workspace.textChannels.includes(value)) {
        return workspace;
      }

      return { ...workspace, textChannels: [...workspace.textChannels, value] };
    });

    setTextChannelDraft("");
  }

  function addVoiceChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = voiceChannelDraft.trim();
    if (!activeChannelWorkspace || !value || activeChannelWorkspace.role === "member") {
      return;
    }

    updateChannelWorkspace((workspace) => {
      if (workspace.voiceChannels.includes(value)) {
        return workspace;
      }

      return { ...workspace, voiceChannels: [...workspace.voiceChannels, value] };
    });

    setVoiceChannelDraft("");
  }

  function addRule() {
    const value = ruleDraft.trim();
    if (!value || !canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({ ...workspace, rules: [...workspace.rules, value] }));
    setRuleDraft("");
  }

  function removeRule(index: number) {
    if (!canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({ ...workspace, rules: workspace.rules.filter((_, currentIndex) => currentIndex !== index) }));
  }

  function addFlair() {
    const label = flairLabel.trim();
    if (!label || !canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({
      ...workspace,
      flairs: [...workspace.flairs, { id: crypto.randomUUID(), label, color: flairColor }],
    }));

    setFlairLabel("");
  }

  function removeFlair(id: string) {
    if (!canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({ ...workspace, flairs: workspace.flairs.filter((flair) => flair.id !== id) }));
  }

  function addAutoRule() {
    const name = autoRuleName.trim();
    const keyword = autoRuleKeyword.trim();

    if (!name || !keyword || !canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({
      ...workspace,
      autoModerationRules: [
        ...workspace.autoModerationRules,
        { id: crypto.randomUUID(), name, keyword, action: autoRuleAction, enabled: true },
      ],
    }));

    setAutoRuleName("");
    setAutoRuleKeyword("");
  }

  function toggleAutoRule(id: string) {
    if (!canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({
      ...workspace,
      autoModerationRules: workspace.autoModerationRules.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)),
    }));
  }

  function removeAutoRule(id: string) {
    if (!canManageChannelWorkspace || !activeChannelWorkspace) {
      return;
    }

    updateChannelWorkspace((workspace) => ({
      ...workspace,
      autoModerationRules: workspace.autoModerationRules.filter((rule) => rule.id !== id),
    }));
  }

  function addTag() {
    const value = postTagDraft.trim();
    if (!value || postTags.includes(value) || postTags.length >= 5) {
      return;
    }

    setPostTags((current) => [...current, value]);
    setPostTagDraft("");
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeChannelWorkspace || postTitle.trim().length < 3) {
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

      mediaUrl = supabase.storage.from("media").getPublicUrl(filePath).data.publicUrl;
    }

    const payloadContent = [postBody.trim(), postTags.length ? `\n\nTags: ${postTags.join(", ")}` : "", isPostMature ? "\n\nMature" : ""].join("").trim();

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      community_id: activeChannelWorkspace.id,
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
    setIsPostMature(false);
    setPostTagDraft("");
    setPostTags([]);
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1">
          {!activeChannelWorkspace ? (
            <section className="m-6 rounded-2xl border border-dashed border-orange-300/30 bg-[#1a0d0b]/50 p-8 text-center text-orange-100/80">Channel workspace not found.</section>
          ) : (
            <section className="overflow-hidden border border-l-0 shadow-[0_40px_80px_-45px_rgba(0,0,0,0.9)]" style={{ borderColor: `${activeChannelWorkspace.theme.primary}66`, backgroundColor: activeChannelWorkspace.theme.secondary }}>
              <div className="h-32 bg-cover bg-center md:h-40" style={activeChannelWorkspace.bannerUrl ? { backgroundImage: `url(${activeChannelWorkspace.bannerUrl})` } : { background: `linear-gradient(105deg, ${activeChannelWorkspace.theme.primary}, ${activeChannelWorkspace.theme.secondary} 68%, #140908)` }} />

              <div className="border-b px-5 py-5 md:px-8" style={{ borderColor: `${activeChannelWorkspace.theme.primary}66` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-200/90">{activeChannelWorkspace.role}</p>
                    <h1 className="text-4xl font-extrabold text-white">{activeChannelWorkspace.name}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-orange-100/80">{activeChannelWorkspace.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsCreatePostOpen(true)} className="rounded-full border px-4 py-2 text-sm font-semibold text-white" style={{ borderColor: `${activeChannelWorkspace.theme.primary}88` }}>
                      + Create post
                    </button>
                    {canManageChannelWorkspace && (
                      <button onClick={() => setIsSettingsOpen(true)} className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: activeChannelWorkspace.theme.primary }}>
                        Channel workspace settings
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid min-h-[calc(100vh-208px)] lg:grid-cols-[280px_1fr_320px]">
                <aside className="space-y-3 border-r border-[#5a2016] bg-[#170706]/95 p-4">
                  <section className="rounded-lg border border-[#653022] bg-[#2b0f0a] p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-orange-200">Text channels</div>
                    <div className="space-y-1">
                      {activeChannelWorkspace.textChannels.map((channel) => (
                        <div key={channel} className="rounded-md bg-black/35 px-2 py-1 text-sm text-orange-50"># {channel}</div>
                      ))}
                    </div>
                    {activeChannelWorkspace.role !== "member" && (
                      <form onSubmit={addTextChannel} className="mt-2 flex gap-1">
                        <input value={textChannelDraft} onChange={(event) => setTextChannelDraft(event.target.value)} placeholder="new-text-channel" className="w-full rounded border border-orange-300/25 bg-black/40 px-2 py-1 text-xs outline-none" />
                        <button type="submit" className="rounded bg-orange-600 px-2 text-xs font-semibold text-white hover:bg-orange-500">+</button>
                      </form>
                    )}
                  </section>

                  <section className="rounded-lg border border-[#653022] bg-[#2b0f0a] p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-orange-200">Voice channels</div>
                    <div className="space-y-1">
                      {activeChannelWorkspace.voiceChannels.map((channel) => (
                        <div key={channel} className="rounded-md bg-black/35 px-2 py-1 text-sm text-orange-50">🔊 {channel}</div>
                      ))}
                    </div>
                    {activeChannelWorkspace.role !== "member" && (
                      <form onSubmit={addVoiceChannel} className="mt-2 flex gap-1">
                        <input value={voiceChannelDraft} onChange={(event) => setVoiceChannelDraft(event.target.value)} placeholder="new-voice-channel" className="w-full rounded border border-orange-300/25 bg-black/40 px-2 py-1 text-xs outline-none" />
                        <button type="submit" className="rounded bg-orange-600 px-2 text-xs font-semibold text-white hover:bg-orange-500">+</button>
                      </form>
                    )}
                  </section>
                </aside>

                <div className="border-r border-[#5a2016] bg-[#200905]/45 p-6">
                  <div className="min-h-[460px] rounded-2xl border border-[#633126] bg-[#2c0e09]/85 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <h2 className="mt-20 text-4xl font-bold text-slate-100">No posts yet</h2>
                    <p className="mt-2 text-lg text-orange-200">Create the first post and start the conversation.</p>
                    <button onClick={() => setIsCreatePostOpen(true)} className="mt-6 rounded-full px-6 py-3 font-semibold text-white" style={{ backgroundColor: activeChannelWorkspace.theme.primary }}>Create post</button>
                  </div>
                </div>

                <aside className="space-y-3 bg-[#190705]/70 p-4">
                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h3 className="text-xl font-bold text-orange-50">{activeChannelWorkspace.name}</h3>
                    <p className="mt-2 text-sm text-orange-200/90">{activeChannelWorkspace.welcomeMessage ?? "Welcome message can be configured in workspace settings."}</p>
                    <div className="mt-3 space-y-1 text-sm text-orange-100/95">
                      <p>🌐 {activeChannelWorkspace.privacy} • {activeChannelWorkspace.joinMode}</p>
                      <p>🔞 {activeChannelWorkspace.mature ? "Mature" : "General"}</p>
                      <p>🏷️ {activeChannelWorkspace.tags.join(", ") || "No tags yet"}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Rules</h4>
                    <ol className="mt-3 space-y-2 text-sm text-orange-100">
                      {activeChannelWorkspace.rules.map((rule, index) => (
                        <li key={`${rule}-${index}`}>{index + 1}. {rule}</li>
                      ))}
                    </ol>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Flairs</h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeChannelWorkspace.flairs.length === 0 ? (
                        <p className="text-xs text-orange-100">No flairs configured yet.</p>
                      ) : (
                        activeChannelWorkspace.flairs.map((flair) => (
                          <span key={flair.id} className="rounded-full px-2 py-1 text-xs text-white" style={{ backgroundColor: flair.color }}>{flair.label}</span>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#653022] bg-[#2a0e09] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-200">Auto moderation</h4>
                    <ul className="mt-2 space-y-1 text-xs text-orange-100">
                      {activeChannelWorkspace.autoModerationRules.length === 0 ? (
                        <li>No rules configured.</li>
                      ) : (
                        activeChannelWorkspace.autoModerationRules.map((rule) => (
                          <li key={rule.id}>
                            {rule.enabled ? "✅" : "⏸️"} {rule.name} → {rule.action} when &quot;{rule.keyword}&quot;
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                </aside>
              </div>
            </section>
          )}

          {activeChannelWorkspace && isSettingsOpen && canManageChannelWorkspace && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
              <div className="w-full max-w-5xl rounded-2xl border border-slate-300/20 bg-[#0f141b] p-6 text-slate-100 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-3xl font-bold">Channel workspace settings</h3>
                    <p className="text-sm text-slate-300">Manage rules, tags, and auto moderation for {activeChannelWorkspace.name}.</p>
                  </div>
                  <button onClick={() => setIsSettingsOpen(false)} className="rounded-full border border-slate-500/40 px-3 py-1" type="button">✕</button>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  <section className="rounded-xl border border-slate-600/30 bg-slate-900/30 p-4">
                    <h4 className="font-semibold">Rules</h4>
                    <ul className="mt-3 space-y-2 text-sm">
                      {activeChannelWorkspace.rules.map((rule, index) => (
                        <li key={`${rule}-${index}`} className="flex items-center justify-between gap-2">
                          <span>• {rule}</span>
                          <button onClick={() => removeRule(index)} type="button" className="rounded border border-slate-500/40 px-2 py-0.5 text-xs">Remove</button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <input value={ruleDraft} onChange={(event) => setRuleDraft(event.target.value)} placeholder="Add rule" className="w-full rounded border border-slate-500/40 bg-black/30 px-2 py-1 text-sm" />
                      <button type="button" onClick={addRule} className="rounded bg-blue-600 px-3 py-1 text-xs">Add</button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-600/30 bg-slate-900/30 p-4">
                    <h4 className="font-semibold">Flairs</h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeChannelWorkspace.flairs.map((flair) => (
                        <span key={flair.id} className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs text-white" style={{ backgroundColor: flair.color }}>
                          {flair.label}
                          <button onClick={() => removeFlair(flair.id)} type="button" className="rounded border border-white/30 px-1">x</button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2">
                      <input value={flairLabel} onChange={(event) => setFlairLabel(event.target.value)} placeholder="Flair label" className="w-full rounded border border-slate-500/40 bg-black/30 px-2 py-1 text-sm" />
                      <input type="color" value={flairColor} onChange={(event) => setFlairColor(event.target.value)} className="h-9 w-full" />
                      <button type="button" onClick={addFlair} className="rounded bg-blue-600 px-3 py-1 text-xs">Add flair</button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-600/30 bg-slate-900/30 p-4">
                    <h4 className="font-semibold">Auto moderation</h4>
                    <ul className="mt-3 space-y-2 text-sm">
                      {activeChannelWorkspace.autoModerationRules.map((rule) => (
                        <li key={rule.id} className="space-y-2 rounded border border-slate-700/50 p-2">
                          <p className="font-semibold">{rule.name}</p>
                          <p className="text-xs text-slate-300">If post contains &quot;{rule.keyword}&quot;, action: {rule.action}</p>
                          <div className="flex gap-2">
                            <button onClick={() => toggleAutoRule(rule.id)} type="button" className="rounded border border-slate-500/40 px-2 py-0.5 text-xs">{rule.enabled ? "Disable" : "Enable"}</button>
                            <button onClick={() => removeAutoRule(rule.id)} type="button" className="rounded border border-slate-500/40 px-2 py-0.5 text-xs">Delete</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 space-y-2">
                      <input value={autoRuleName} onChange={(event) => setAutoRuleName(event.target.value)} placeholder="Rule name" className="w-full rounded border border-slate-500/40 bg-black/30 px-2 py-1 text-sm" />
                      <input value={autoRuleKeyword} onChange={(event) => setAutoRuleKeyword(event.target.value)} placeholder="Keyword / phrase" className="w-full rounded border border-slate-500/40 bg-black/30 px-2 py-1 text-sm" />
                      <select value={autoRuleAction} onChange={(event) => setAutoRuleAction(event.target.value as "flag" | "remove")} className="w-full rounded border border-slate-500/40 bg-black/30 px-2 py-1 text-sm">
                        <option value="flag">Flag for review</option>
                        <option value="remove">Auto remove</option>
                      </select>
                      <button type="button" onClick={addAutoRule} className="rounded bg-blue-600 px-3 py-1 text-xs">Add rule</button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeChannelWorkspace && isCreatePostOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
              <div className="w-full max-w-4xl rounded-2xl border border-slate-300/20 bg-[#0f141b] p-6 text-slate-100 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-4xl font-bold text-slate-100">Create post</h3>
                  <button onClick={() => setIsCreatePostOpen(false)} className="rounded-full border border-slate-400/40 px-3 py-1 text-sm" type="button">✕</button>
                </div>
                <p className="text-sm text-slate-300">{activeChannelWorkspace.name}</p>

                <form onSubmit={submitPost} className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 text-pink-300">
                      <input type="checkbox" checked={isPostMature} onChange={(event) => setIsPostMature(event.target.checked)} /> Mature
                    </label>
                    <div className="flex items-center gap-2">
                      <input value={postTagDraft} onChange={(event) => setPostTagDraft(event.target.value)} placeholder="Add tag" className="rounded-full border border-slate-400/30 bg-black/40 px-3 py-1 text-xs" />
                      <button type="button" onClick={addTag} className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold">Add</button>
                    </div>
                    {postTags.length > 0 && <p className="text-xs text-slate-300">{postTags.join(" • ")}</p>}
                  </div>

                  <input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} maxLength={300} required placeholder="Title*" className="w-full rounded-2xl border border-slate-400/30 bg-transparent px-4 py-3 text-lg" />

                  <div className="rounded-2xl border border-dashed border-slate-400/30 bg-slate-900/40 p-5">
                    <label className="text-sm text-slate-300">Image (optional)</label>
                    <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(event) => setPostImage(event.target.files?.[0] ?? null)} />
                  </div>

                  <textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="Body text (optional)" rows={8} className="w-full rounded-2xl border border-slate-400/30 bg-transparent p-4" />

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
