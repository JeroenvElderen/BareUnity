"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeImageUpload } from "@/lib/image";
import { supabase } from "@/lib/supabase";

type StudioMedia = {
  id: string;
  file: File;
  previewUrl: string;
};

type ModerationScores = {
  pornography: number;
  enticingOrSensual: number;
  normal: number;
};

type BlockedModerationDetail = {
  fileName: string;
  reason: string;
  scores: ModerationScores;
};

type CreatePostProps = {
  onPublished?: () => void;
  onCancel?: () => void;
};

const COMMUNITY_TAGS = ["beach day", "forest walk", "wellness", "body positivity", "sunrise", "retreat"];
const TRUSTED_EXPLICIT_ROLES = new Set(["club_admin", "moderator", "platform_admin"]);

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export default function CreatePost({ onPublished, onCancel }: CreatePostProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [flair, setFlair] = useState("community");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [respectGuidelines, setRespectGuidelines] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mediaStudio, setMediaStudio] = useState<StudioMedia[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [moderationInProgress, setModerationInProgress] = useState(false);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("newcomer");
  const [blockedModerationDetails, setBlockedModerationDetails] = useState<BlockedModerationDetail[]>([]);
  const [showModerationPopup, setShowModerationPopup] = useState(false);

  const activeMedia = mediaStudio[activeMediaIndex] ?? null;
  const titleCount = title.length;
  const captionWords = caption.trim() ? caption.trim().split(/\s+/).length : 0;

  useEffect(() => {
    let isMounted = true;

    async function loadUploaderRole() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      const { data } = await supabase
        .from("profile_settings")
        .select("user_role")
        .eq("user_id", user.id)
        .maybeSingle<{ user_role: string | null }>();

      if (!isMounted) return;
      setCurrentUserRole(data?.user_role ?? "newcomer");
    }

    void loadUploaderRole();

    return () => {
      isMounted = false;
    };
  }, []);

  const submitDisabled = useMemo(() => {
    if (loading || moderationInProgress) return true;
    if (!title.trim()) return true;
    if (mediaStudio.length === 0) return true;
    if (!consentConfirmed) return true;
    return false;
  }, [consentConfirmed, loading, mediaStudio.length, moderationInProgress, title]);

  async function checkImageModeration(file: File, allowExplicit: boolean) {
    const formData = new FormData();
    formData.set("image", file);
    formData.set("allowExplicit", allowExplicit ? "1" : "0");

    const response = await fetch("/api/moderation/nsfw", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as {
      decision?: "allow" | "review" | "block";
      reason?: string;
      scores?: ModerationScores;
      error?: string;
    };

    if (!response.ok && response.status !== 422) {
      return {
        decision: "block" as const,
        reason: payload.error ?? "Unable to analyze image",
        scores: payload.scores ?? { pornography: 0, enticingOrSensual: 0, normal: 0 },
      };
    }

    return {
      decision: payload.decision ?? "review",
      reason: payload.reason ?? "Content is not allowed.",
      scores: payload.scores ?? { pornography: 0, enticingOrSensual: 0, normal: 0 },
    };
  }

  async function onFilesAdded(fileList: FileList | null) {
    if (!fileList?.length) return;

    const images = Array.from(fileList).filter((file) => file.type.startsWith("image/"));

    if (!images.length) return;

    setModerationInProgress(true);
    setModerationMessage(null);

    const approved: StudioMedia[] = [];
    const blockedNames: string[] = [];
    const blockedReasons: string[] = [];
    const blockedDetails: BlockedModerationDetail[] = [];
    const allowExplicit = TRUSTED_EXPLICIT_ROLES.has(currentUserRole);

    for (const file of images) {
      try {
        const moderation = await checkImageModeration(file, allowExplicit);

        if (moderation.decision !== "allow") {
          blockedNames.push(file.name);
          blockedReasons.push(moderation.reason);
          blockedDetails.push({
            fileName: file.name,
            reason: moderation.reason,
            scores: moderation.scores,
          });
          continue;
        }

        approved.push({
          id: uid("media"),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      } catch (error) {
        console.error(error);
        blockedNames.push(file.name);
        blockedReasons.push("moderation check failed");
        blockedDetails.push({
          fileName: file.name,
          reason: "moderation check failed",
          scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        });
      }
    }

    setMediaStudio((current) => [...current, ...approved]);

    if (blockedNames.length) {
      const uniqueReasons = Array.from(new Set(blockedReasons));
      setModerationMessage(
        `Removed ${blockedNames.length} image${blockedNames.length > 1 ? "s" : ""}: ${uniqueReasons.join(" • ")}.`,
      );
      setBlockedModerationDetails(blockedDetails);
      setShowModerationPopup(true);
    } else {
      setModerationMessage(null);
      setBlockedModerationDetails([]);
      setShowModerationPopup(false);
    }

    setModerationInProgress(false);
  }

  function removeMedia(id: string) {
    setMediaStudio((current) => {
      const next = current.filter((entry) => entry.id !== id);
      const nextIndex = Math.max(0, Math.min(activeMediaIndex, next.length - 1));
      setActiveMediaIndex(nextIndex);
      return next;
    });
  }

  function moveMedia(direction: "prev" | "next") {
    setActiveMediaIndex((current) => {
      if (mediaStudio.length === 0) return 0;
      if (direction === "prev") return (current - 1 + mediaStudio.length) % mediaStudio.length;
      return (current + 1) % mediaStudio.length;
    });
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag].slice(0, 4)));
  }

  async function handleSubmit() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      alert("You must be logged in");
      setLoading(false);
      return;
    }

    let firstMediaUrl: string | null = null;
    const uploadedUrls: string[] = [];

    for (const media of mediaStudio) {
      const optimized = await sanitizeImageUpload(media.file);
      const filePath = `posts/${crypto.randomUUID()}-${optimized.name}`;
      const { error } = await supabase.storage.from("media").upload(filePath, optimized);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const { data } = supabase.storage.from("media").getPublicUrl(filePath);
      uploadedUrls.push(data.publicUrl);
      if (!firstMediaUrl) firstMediaUrl = data.publicUrl;
    }

    const extras = {
      flair,
      tags: selectedTags,
      location: location.trim() || null,
      consentConfirmed,
      respectGuidelines,
      mediaCount: mediaStudio.length,
      gallery: uploadedUrls,
      community: "naturist",
    };

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      title: title.trim(),
      content: `${caption.trim()}\n\n---composer-meta---\n${JSON.stringify(extras)}`,
      media_url: firstMediaUrl,
      post_type: "images",
    });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onPublished?.();
    window.location.reload();
  }

  const livePreviewCard = (
    <article className="overflow-hidden rounded-2xl border border-accent/20 bg-bg/60">
      <div className="h-40 bg-linear-to-br from-brand/85 to-brand-2/85">
        {activeMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeMedia.previewUrl} alt={activeMedia.file.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-200">Your cover image will appear here</div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <h3 className="text-xl font-extrabold leading-tight text-text">{title.trim() || "Your naturist post title"}</h3>
        <p className="line-clamp-5 text-sm leading-relaxed text-slate-200/90">
          {caption.trim() || "Share a calm, respectful story about your naturist experience."}
        </p>
        <div className="text-xs text-muted">By @you · image post · just now {location.trim() ? `· ${location.trim()}` : ""}</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">#{flair.trim() || "community"}</span>
          {selectedTags.map((tag) => (
            <span key={tag} className="rounded-full border border-accent/20 bg-card/35 px-2.5 py-1 text-[11px] text-muted">#{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );

  return (
    <>
      <section className="glass-card-strong flex min-h-[calc(100vh-2.5rem)] flex-col rounded-3xl p-4 text-text sm:p-5 lg:h-[calc(100vh-2.5rem)] lg:overflow-hidden">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-accent/20 pb-3">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Community / Share Photos</p>
          <h2 className="mt-1 text-xl font-bold text-text sm:text-2xl">Naturist Post Studio</h2>
          <p className="mt-1 text-sm text-muted">Share respectful naturist moments with context and consent.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="premium-button w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {loading ? "Publishing..." : moderationInProgress ? "Screening images..." : "Publish Post"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          
      <input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 180))}
            placeholder="Post title*"
            className="glass-input mb-1 w-full rounded-2xl px-4 py-3 text-2xl leading-tight text-text outline-none placeholder:text-muted focus:border-accent/50 sm:text-3xl"
          />
          <div className="mb-4 text-right text-xs text-muted">{titleCount}/180</div>

          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Tell the community about this moment (optional caption)."
            className="glass-input mb-4 min-h-36 w-full rounded-2xl px-4 py-3 text-base leading-relaxed text-text outline-none placeholder:text-muted focus:border-accent/50"
          />

          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px]">
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location (optional): beach, retreat, hiking trail..."
              className="glass-input rounded-xl px-3 py-2.5 text-sm text-text outline-none"
            />
            <input
              value={flair}
              onChange={(event) => setFlair(event.target.value)}
              placeholder="Flair"
              className="glass-input rounded-xl px-3 py-2.5 text-sm text-text outline-none"
            />
          </div>

      <div>
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">Community tags (choose up to 4)</p>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active ? "border-accent/60 bg-accent/15 text-accent" : "border-accent/20 bg-card/35 text-muted hover:text-text"
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>

        <div className="rounded-2xl border border-accent/20 bg-bg/45 p-3 xl:hidden">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Live preview</p>
            {livePreviewCard}
          </div>
          
          <div
            className="rounded-2xl border border-dashed border-accent/30 bg-bg/40 p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void onFilesAdded(event.dataTransfer.files);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">Upload naturist images (shown in live preview)</p>
              <label className="cursor-pointer rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-text">
                Upload Images
                <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void onFilesAdded(event.target.files)} />
              </label>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-accent/20 bg-bg/50 px-3 py-2 text-xs text-muted">
              <span>{mediaStudio.length ? `${mediaStudio.length} image${mediaStudio.length > 1 ? "s" : ""} selected` : "No images selected yet"}</span>
              {activeMedia ? <span className="max-w-56 truncate">{activeMedia.file.name}</span> : null}
            </div>

            {moderationMessage ? (
              <p className="mt-2 text-xs text-amber-200">{moderationMessage}</p>
            ) : null}

            {mediaStudio.length > 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => moveMedia("prev")} className="rounded-full border border-accent/20 bg-card/35 px-3 py-1 text-xs text-muted">Prev</button>
                <button type="button" onClick={() => moveMedia("next")} className="rounded-full border border-accent/20 bg-card/35 px-3 py-1 text-xs text-muted">Next</button>
                {activeMedia ? (
                  <button type="button" onClick={() => removeMedia(activeMedia.id)} className="rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs text-rose-100">
                    Remove current
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          
          <div className="grid gap-1.5 rounded-2xl border border-accent/20 bg-bg/40 p-3 text-sm text-muted">
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-1" />
              <span>I confirm everyone visible has agreed to be posted and this content follows community standards.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" checked={respectGuidelines} onChange={(event) => setRespectGuidelines(event.target.checked)} className="mt-1" />
              <span>Keep comments constructive and body-positive.</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {onCancel ? (
              <button type="button" onClick={onCancel} className="rounded-full border border-accent/25 bg-card/35 px-5 py-2.5 text-sm font-semibold text-muted">
                Cancel
              </button>
            ) : null}
            <span className="rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-xs font-semibold text-muted">{captionWords} words in caption</span>
          </div>
        </div>

        <aside className="hidden min-h-0 overflow-hidden rounded-2xl border border-accent/20 bg-bg/45 p-3 xl:sticky xl:top-3 xl:block xl:self-start">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Live preview</p>
          {livePreviewCard}
        </aside>
      </div>
      </section>

      {showModerationPopup ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-rose-400/40 bg-bg p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-rose-400/30 pb-2">
              <h3 className="text-base font-semibold text-rose-100">Upload blocked by moderation (testing)</h3>
              <button
                type="button"
                onClick={() => setShowModerationPopup(false)}
                className="rounded-full border border-rose-300/40 px-3 py-1 text-xs text-rose-100"
              >
                Close
              </button>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {blockedModerationDetails.map((detail) => (
                <div key={`${detail.fileName}-${detail.reason}`} className="rounded-xl border border-rose-400/25 bg-rose-950/20 p-3 text-xs text-rose-100">
                  <p className="font-semibold">{detail.fileName}</p>
                  <p className="mt-1 text-rose-100/85">{detail.reason}</p>
                  <div className="mt-2 grid gap-1 text-[11px] text-rose-100/90 sm:grid-cols-3">
                    <span>Pornography: {detail.scores.pornography.toFixed(4)}</span>
                    <span>Enticing: {detail.scores.enticingOrSensual.toFixed(4)}</span>
                    <span>Normal: {detail.scores.normal.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}