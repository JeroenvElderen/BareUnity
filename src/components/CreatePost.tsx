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
    <div className="mb-6 rounded-2xl border border-sand/20 bg-card/75 p-4 shadow-[0_20px_45px_-35px_rgba(0,0,0,0.95)] backdrop-blur">
      <textarea
        placeholder="Share something..."
        className="mb-3 w-full rounded-xl border border-sand/20 bg-sand/80 p-3 text-pine outline-none placeholder:text-pine/55 focus:ring-2 focus:ring-sand/30"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <input
        type="file"
        accept="image/*"
        className="rounded-lg border border-sand/15 bg-sand/10 p-2 text-sm text-text"
        onChange={(e) => setImage(e.target.files?.[0] || null)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-3 rounded-xl border border-sand/30 bg-gradient-to-r from-pine to-pine-2 px-4 py-2 font-semibold text-sand transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Posting..." : "Post"}
      </button>
    </div>
  );
}