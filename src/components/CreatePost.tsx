"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type StudioMedia = {
  id: string;
  file: File;
  previewUrl: string;
};

type CreatePostProps = {
  onPublished?: () => void;
  onCancel?: () => void;
};

const COMMUNITY_TAGS = ["beach day", "forest walk", "wellness", "body positivity", "sunrise", "retreat"];

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function optimizeImage(file: File) {
  return new Promise<File>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 1920;
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        if (!context) {
          resolve(file);
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            const optimized = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(optimized);
          },
          "image/webp",
          0.84,
        );
      };

      image.src = String(reader.result ?? "");
    };

    reader.readAsDataURL(file);
  });
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

  const activeMedia = mediaStudio[activeMediaIndex] ?? null;
  const titleCount = title.length;
  const captionWords = caption.trim() ? caption.trim().split(/\s+/).length : 0;

  const submitDisabled = useMemo(() => {
    if (loading) return true;
    if (!title.trim()) return true;
    if (mediaStudio.length === 0) return true;
    if (!consentConfirmed) return true;
    return false;
  }, [consentConfirmed, loading, mediaStudio.length, title]);

  function onFilesAdded(fileList: FileList | null) {
    if (!fileList?.length) return;

    const next = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: uid("media"),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

    setMediaStudio((current) => [...current, ...next]);
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
      const optimized = await optimizeImage(media.file);
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
      <div className="h-40 bg-linear-to-br from-emerald-600/80 to-cyan-500/80">
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
            <span key={tag} className="rounded-full border border-accent/20 bg-white/5 px-2.5 py-1 text-[11px] text-muted">#{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );

  return (
    <section className="glass-card-strong flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-3xl p-4 text-text sm:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-accent/20 pb-3">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Community / Share Photos</p>
          <h2 className="mt-1 text-xl font-bold text-text sm:text-2xl">Naturist Post Studio</h2>
          <p className="mt-1 text-sm text-muted">Share respectful naturist moments with context and consent.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="premium-button rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Publishing..." : "Publish Post"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
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
                      active ? "border-accent/60 bg-accent/15 text-accent" : "border-accent/20 bg-white/5 text-muted hover:text-text"
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
              onFilesAdded(event.dataTransfer.files);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">Upload naturist images (shown in live preview)</p>
              <label className="cursor-pointer rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-text">
                Upload Images
                <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => onFilesAdded(event.target.files)} />
              </label>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-accent/20 bg-bg/50 px-3 py-2 text-xs text-muted">
              <span>{mediaStudio.length ? `${mediaStudio.length} image${mediaStudio.length > 1 ? "s" : ""} selected` : "No images selected yet"}</span>
              {activeMedia ? <span className="max-w-56 truncate">{activeMedia.file.name}</span> : null}
            </div>

            {mediaStudio.length > 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => moveMedia("prev")} className="rounded-full border border-accent/20 bg-white/5 px-3 py-1 text-xs text-muted">Prev</button>
                <button type="button" onClick={() => moveMedia("next")} className="rounded-full border border-accent/20 bg-white/5 px-3 py-1 text-xs text-muted">Next</button>
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
              <button type="button" onClick={onCancel} className="rounded-full border border-accent/25 bg-white/5 px-5 py-2.5 text-sm font-semibold text-muted">
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
  );
}