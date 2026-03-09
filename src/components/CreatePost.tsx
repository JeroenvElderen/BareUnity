"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreatePost() {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      alert("You must be logged in");
      setLoading(false);
      return;
    }

    let mediaUrl: string | null = null;

    if (image) {
      const filePath = `posts/${crypto.randomUUID()}-${image.name}`;
      const { error } = await supabase.storage.from("media").upload(filePath, image);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const { data } = supabase.storage.from("media").getPublicUrl(filePath);
      mediaUrl = data.publicUrl;
    }

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      content,
      media_url: mediaUrl,
    });

    if (error) {
      console.error(error);
    }

    setContent("");
    setImage(null);
    setLoading(false);
    window.location.reload();
  }

  return (
    <section className="glass-card-strong p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">Create post</h2>
        <span className="text-xs text-muted">Share an update</span>
      </div>

      <textarea
        placeholder="What are you experiencing today?"
        className="mb-3 min-h-28 w-full rounded-2xl border border-accent/20 bg-bg/40 p-3 text-sm text-text outline-none placeholder:text-muted focus:border-accent/35"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/*"
          className="max-w-full rounded-xl border border-accent/20 bg-white/5 p-2 text-xs text-text file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-text"
          onChange={(e) => setImage(e.target.files?.[0] || null)}
        />

        <button onClick={handleSubmit} disabled={loading} className="premium-button text-sm disabled:opacity-60">
          {loading ? "Posting..." : "Publish"}
        </button>
      </div>
    </section>
  );
}