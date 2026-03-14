"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ComposerTab = "text" | "images" | "link" | "poll" | "ama";

type StudioMedia = {
  id: string;
  file: File;
  previewUrl: string;
};

type CreatePostProps = {
  onPublished?: () => void;
  onCancel?: () => void;
};

const tabs: { key: ComposerTab; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "images", label: "Images" },
  { key: "link", label: "Link" },
  { key: "poll", label: "Poll" },
  { key: "ama", label: "AMA" },
];

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
          0.8,
        );
      };

      image.src = String(reader.result ?? "");
    };

    reader.readAsDataURL(file);
  });
}

export default function CreatePost({ onPublished, onCancel }: CreatePostProps) {
  const [activeTab, setActiveTab] = useState<ComposerTab>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [flair, setFlair] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("");
  const [pollOptionB, setPollOptionB] = useState("");
  const [nsfw, setNsfw] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mediaStudio, setMediaStudio] = useState<StudioMedia[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  const titleCount = title.length;
  const activeMedia = mediaStudio[activeMediaIndex] ?? null;

  const submitDisabled = useMemo(() => {
    if (loading) return true;
    if (!title.trim()) return true;
    if (!flair.trim()) return true;
    if (activeTab === "link" && !linkUrl.trim()) return true;
    if (activeTab === "poll" && (!pollQuestion.trim() || !pollOptionA.trim() || !pollOptionB.trim())) return true;
    return false;
  }, [activeTab, flair, linkUrl, loading, pollOptionA, pollOptionB, pollQuestion, title]);

  function onFilesAdded(fileList: FileList | null) {
    if (!fileList?.length) return;

    const next = Array.from(fileList).map((file) => ({
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

    for (const media of mediaStudio) {
      const optimized = media.file.type.startsWith("image/") ? await optimizeImage(media.file) : media.file;
      const filePath = `posts/${crypto.randomUUID()}-${optimized.name}`;
      const { error } = await supabase.storage.from("media").upload(filePath, optimized);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      if (!firstMediaUrl) {
        const { data } = supabase.storage.from("media").getPublicUrl(filePath);
        firstMediaUrl = data.publicUrl;
      }
    }

    const extras = {
      flair,
      nsfw,
      linkUrl: activeTab === "link" ? linkUrl.trim() : null,
      poll:
        activeTab === "poll"
          ? {
              question: pollQuestion,
              options: [pollOptionA, pollOptionB],
            }
          : null,
      ama: activeTab === "ama",
      mediaCount: mediaStudio.length,
    };

    const contentParts = [body.trim()];
    if (activeTab === "link" && linkUrl.trim()) contentParts.push(`Link: ${linkUrl.trim()}`);
    if (activeTab === "poll" && pollQuestion.trim()) {
      contentParts.push(`Poll: ${pollQuestion.trim()} | ${pollOptionA.trim()} / ${pollOptionB.trim()}`);
    }
    if (activeTab === "ama") contentParts.push("AMA post");

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      title: title.trim(),
      content: `${contentParts.filter(Boolean).join("\n\n")}\n\n---composer-meta---\n${JSON.stringify(extras)}`,
      media_url: firstMediaUrl,
      post_type: activeTab,
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

  return (
    <section className="glass-card-strong rounded-3xl p-4 text-text sm:p-6">
      <div className="mb-5 flex flex-wrap gap-2 border-b border-accent/20 pb-3 text-sm font-semibold sm:text-base">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full border px-3 py-1.5 transition ${
              activeTab === tab.key
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-accent/20 bg-white/5 text-muted hover:border-accent/35 hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setNsfw((current) => !current)}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${nsfw ? "border-rose-400/60 bg-rose-400/15 text-rose-100" : "border-accent/25 bg-white/5 text-muted"}`}
        >
          18 NSFW
        </button>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-accent/20 bg-white/5 px-3 py-1.5 text-xs text-muted hover:text-text">
          ✎ Tag
          <input className="hidden" value={flair} onChange={(event) => setFlair(event.target.value)} placeholder="Add flair" />
        </label>
        <input
          value={flair}
          onChange={(event) => setFlair(event.target.value)}
          placeholder="Add flair*"
          className="glass-input rounded-full px-3 py-1.5 text-sm text-text outline-none placeholder:text-muted focus:border-accent/50"
        />
      </div>

      <div className="mb-1 flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, 300))}
          placeholder="Title*"
          className="glass-input w-full rounded-2xl px-4 py-3 text-2xl leading-tight text-text outline-none placeholder:text-muted focus:border-accent/50 sm:text-3xl"
        />
      </div>
      <div className="mb-4 text-right text-xs text-muted">{titleCount}/300</div>

      {activeTab === "link" ? (
        <input
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="Paste link URL"
          className="glass-input mb-4 w-full rounded-2xl px-4 py-3 text-sm text-text outline-none placeholder:text-muted focus:border-accent/50"
        />
      ) : null}

      {activeTab === "poll" ? (
        <div className="mb-4 grid gap-2">
          <input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" className="glass-input w-full rounded-2xl px-4 py-3 text-sm text-text outline-none placeholder:text-muted focus:border-accent/50" />
          <input value={pollOptionA} onChange={(event) => setPollOptionA(event.target.value)} placeholder="Option 1" className="glass-input w-full rounded-2xl px-4 py-3 text-sm text-text outline-none placeholder:text-muted focus:border-accent/50" />
          <input value={pollOptionB} onChange={(event) => setPollOptionB(event.target.value)} placeholder="Option 2" className="glass-input w-full rounded-2xl px-4 py-3 text-sm text-text outline-none placeholder:text-muted focus:border-accent/50" />
        </div>
      ) : null}

      <div
        className="mb-4 rounded-3xl border border-dashed border-accent/30 bg-bg/40 p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFilesAdded(event.dataTransfer.files);
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted">Drag and drop or upload media</p>
          <label className="cursor-pointer rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-text">
            Upload
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => onFilesAdded(event.target.files)} />
          </label>
        </div>

        {activeMedia ? (
          <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-bg/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeMedia.previewUrl} alt={activeMedia.file.name} className="mx-auto h-72 w-full object-contain sm:h-100" />
            <button type="button" onClick={() => moveMedia("prev")} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white">‹</button>
            <button type="button" onClick={() => moveMedia("next")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-white">›</button>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-accent/20 text-muted">No media selected yet</div>
        )}

        {mediaStudio.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {mediaStudio.map((media, index) => (
              <button
                key={media.id}
                type="button"
                onClick={() => setActiveMediaIndex(index)}
                className={`rounded-lg border ${index === activeMediaIndex ? "border-accent/70" : "border-accent/25"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.previewUrl} alt={media.file.name} className="h-12 w-12 rounded-lg object-cover" />
              </button>
            ))}
            {activeMedia ? (
              <button type="button" onClick={() => removeMedia(activeMedia.id)} className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
                Remove current
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Body text (optional)"
        className="glass-input mb-5 min-h-44 w-full rounded-2xl px-4 py-3 text-base leading-relaxed text-text outline-none placeholder:text-muted focus:border-accent/50"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-full border border-accent/25 bg-white/5 px-5 py-2.5 text-sm font-semibold text-muted">
            Cancel
          </button>
        ) : null}
        <button type="button" className="rounded-full border border-accent/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-muted" disabled>
          Save Draft
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className="premium-button rounded-full px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Posting..." : "Post"}
        </button>
      </div>
    </section>
  );
}