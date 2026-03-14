"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type BlockType = "text" | "media" | "embed" | "code" | "poll";

type EditorBlock = {
  id: string;
  type: BlockType;
  text?: string;
  embedUrl?: string;
  code?: string;
  codeLanguage?: string;
  pollQuestion?: string;
  pollOptions?: string[];
};

type StudioMedia = {
  id: string;
  file: File;
  previewUrl: string;
};

const tonePresets = ["friendly", "professional", "energetic"] as const;

type TonePreset = (typeof tonePresets)[number];

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function summarizeText(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 2) return text;
  return `${sentences.slice(0, 2).join(" ")} ${sentences.length > 2 ? "…" : ""}`.trim();
}

function improveClarity(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bvery\b/gi, "")
    .replace(/\breally\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyTone(text: string, tone: TonePreset) {
  if (!text.trim()) return text;

  if (tone === "professional") return `Update: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  if (tone === "energetic") return `${text.replace(/\.$/, "")} 🚀`;
  return `${text.replace(/\.$/, "")}. Thanks for reading!`;
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
          0.78,
        );
      };

      image.src = String(reader.result ?? "");
    };

    reader.readAsDataURL(file);
  });
}

export default function CreatePost() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [mediaStudio, setMediaStudio] = useState<StudioMedia[]>([]);
  const [blocks, setBlocks] = useState<EditorBlock[]>([
    { id: uid("block"), type: "text", text: "" },
  ]);

  const postPreview = useMemo(
    () =>
      blocks
        .map((block) => {
          if (block.type === "text") return block.text?.trim() ?? "";
          if (block.type === "embed") return `Embedded: ${block.embedUrl ?? ""}`;
          if (block.type === "code") return `Code (${block.codeLanguage ?? "txt"})`;
          if (block.type === "poll") return `Poll: ${block.pollQuestion ?? ""}`;
          return "Media block";
        })
        .filter(Boolean)
        .join("\n"),
    [blocks],
  );

  function addBlock(type: BlockType) {
    setBlocks((current) => [
      ...current,
      {
        id: uid("block"),
        type,
        text: type === "text" ? "" : undefined,
        pollOptions: type === "poll" ? ["Option 1", "Option 2"] : undefined,
        codeLanguage: type === "code" ? "typescript" : undefined,
      },
    ]);
  }

  function updateBlock(id: string, updates: Partial<EditorBlock>) {
    setBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...updates } : block)));
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
  }

  function runLocalWritingAssistant(mode: "summarize" | "clarity" | TonePreset) {
    const firstTextBlock = blocks.find((block) => block.type === "text");
    if (!firstTextBlock?.text) return;

    let transformed = firstTextBlock.text;
    if (mode === "summarize") transformed = summarizeText(transformed);
    if (mode === "clarity") transformed = improveClarity(transformed);
    if (tonePresets.includes(mode as TonePreset)) transformed = applyTone(transformed, mode as TonePreset);

    updateBlock(firstTextBlock.id, { text: transformed });
    setContent(transformed);
  }

  function onFilesAdded(fileList: FileList | null) {
    if (!fileList?.length) return;

    const next = Array.from(fileList).map((file) => ({
      id: uid("media"),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setMediaStudio((current) => [...current, ...next]);
  }

  function reorderMedia(fromIndex: number, toIndex: number) {
    setMediaStudio((current) => {
      const copy = [...current];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
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

    const serializedBlocks = JSON.stringify(blocks);
    const textFromBlocks = postPreview || content;
    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      content: textFromBlocks ? `${textFromBlocks}\n\n---blocks---\n${serializedBlocks}` : serializedBlocks,
      media_url: firstMediaUrl,
      post_type: "blocks",
    });

    if (error) console.error(error);

    setContent("");
    setBlocks([{ id: uid("block"), type: "text", text: "" }]);
    setMediaStudio([]);
    setLoading(false);
    window.location.reload();
  }

  return (
    <section className="glass-card-strong space-y-4 p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">Block editor</h2>
        <span className="text-xs text-muted">Text, media, embeds, code, polls</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["text", "media", "embed", "code", "poll"] as BlockType[]).map((type) => (
          <button key={type} type="button" onClick={() => addBlock(type)} className="rounded-full border border-accent/40 px-3 py-1 text-xs capitalize">
            + {type}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {blocks.map((block) => (
          <article key={block.id} className="rounded-2xl border border-white/10 bg-bg/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-xs uppercase tracking-wider text-accent/80">{block.type} block</strong>
              <button type="button" className="text-xs text-muted" onClick={() => removeBlock(block.id)}>
                Remove
              </button>
            </div>

            {block.type === "text" ? <textarea value={block.text ?? ""} onChange={(event) => updateBlock(block.id, { text: event.target.value })} className="glass-input min-h-24 w-full rounded-xl p-2 text-sm" placeholder="Write your story..." /> : null}
            {block.type === "embed" ? <input value={block.embedUrl ?? ""} onChange={(event) => updateBlock(block.id, { embedUrl: event.target.value })} className="glass-input w-full rounded-xl p-2 text-sm" placeholder="Paste embed URL" /> : null}
            {block.type === "code" ? (
              <div className="space-y-2">
                <input value={block.codeLanguage ?? ""} onChange={(event) => updateBlock(block.id, { codeLanguage: event.target.value })} className="glass-input w-full rounded-xl p-2 text-sm" placeholder="Language" />
                <textarea value={block.code ?? ""} onChange={(event) => updateBlock(block.id, { code: event.target.value })} className="glass-input min-h-24 w-full rounded-xl p-2 font-mono text-xs" placeholder="Code snippet" />
              </div>
            ) : null}
            {block.type === "poll" ? (
              <div className="space-y-2">
                <input value={block.pollQuestion ?? ""} onChange={(event) => updateBlock(block.id, { pollQuestion: event.target.value })} className="glass-input w-full rounded-xl p-2 text-sm" placeholder="Poll question" />
                {(block.pollOptions ?? []).map((option, index) => (
                  <input key={`${block.id}_option_${index + 1}`} value={option} onChange={(event) => updateBlock(block.id, { pollOptions: (block.pollOptions ?? []).map((entry, optionIndex) => (optionIndex === index ? event.target.value : entry)) })} className="glass-input w-full rounded-xl p-2 text-sm" placeholder={`Option ${index + 1}`} />
                ))}
              </div>
            ) : null}
            {block.type === "media" ? <p className="text-xs text-muted">Use the media studio below to attach files to this post.</p> : null}
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-bg/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <strong className="text-xs uppercase tracking-wider text-accent/80">AI writing assistance (local + free)</strong>
          <span className="text-[11px] text-muted">No paid API required</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-accent/40 px-3 py-1 text-xs" onClick={() => runLocalWritingAssistant("summarize")}>Summarize</button>
          <button type="button" className="rounded-full border border-accent/40 px-3 py-1 text-xs" onClick={() => runLocalWritingAssistant("clarity")}>Improve clarity</button>
          {tonePresets.map((tone) => (
            <button key={tone} type="button" className="rounded-full border border-accent/40 px-3 py-1 text-xs capitalize" onClick={() => runLocalWritingAssistant(tone)}>
              Tone: {tone}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-2xl border border-dashed border-accent/50 bg-bg/20 p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFilesAdded(event.dataTransfer.files);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">Drag-and-drop media studio</strong>
          <input type="file" accept="image/*,video/*" multiple className="text-xs" onChange={(event) => onFilesAdded(event.target.files)} />
        </div>
        <p className="mt-1 text-xs text-muted">Images are automatically optimized to webp before upload.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mediaStudio.map((media, index) => (
            <div key={media.id} className="overflow-hidden rounded-xl border border-white/10 bg-bg/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.previewUrl} alt={media.file.name} className="h-24 w-full rounded-lg object-cover" />
              <p className="mt-1 truncate text-[11px] text-muted">{media.file.name}</p>
              <div className="mt-2 flex gap-1">
                <button type="button" className="rounded bg-white/10 px-2 py-1 text-[10px]" disabled={index === 0} onClick={() => reorderMedia(index, index - 1)}>←</button>
                <button type="button" className="rounded bg-white/10 px-2 py-1 text-[10px]" disabled={index === mediaStudio.length - 1} onClick={() => reorderMedia(index, index + 1)}>→</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading} className="premium-button text-sm disabled:opacity-60">
        {loading ? "Publishing..." : "Publish block post"}
      </button>
    </section>
  );
}