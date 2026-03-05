"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Post } from "@/types/database";

type Comment = {
  id: string;
  author: string;
  body: string;
};

export default function PostCard({ post }: { post: Post }) {
    const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [score, setScore] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);

  const profile = post.profiles[0];
  const commentCountLabel = useMemo(() => `${comments.length} comment${comments.length === 1 ? "" : "s"}`, [comments.length]);

  function applyVote(nextVote: -1 | 0 | 1) {
    const delta = nextVote - vote;
    setVote(nextVote);
    setScore((current) => current + delta);
  }

  function addComment() {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    setComments((current) => [
      {
        id: crypto.randomUUID(),
        author: profile?.username ?? "Guest",
        body: trimmed,
      },
      ...current,
    ]);
    setCommentText("");
  }

  return (
    <article className="rounded-xl border border-pine/20 bg-card/80 p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-3">
        {profile?.avatar_url && (
          <Image
            src={profile.avatar_url}
            alt="User avatar"
            width={40}
            height={40}
            className="rounded-full"
          />
        )}

        <div>
          <p className="font-semibold text-pine">{profile?.username ?? "Unknown"}</p>
          <p className="text-sm text-pine/70">{new Date(post.created_at).toLocaleString()}</p>
        </div>
      </div>

      {post.title && <h2 className="mb-2 text-lg font-bold text-pine">{post.title}</h2>}

      {post.content && <p className="mb-3 text-pine/90">{post.content}</p>}

      {post.media_url && (
        <Image
          src={post.media_url}
          alt="Post image"
          width={800}
          height={500}
          className="max-h-[500px] rounded-lg object-cover"
        />
      )}

    <div className="mt-4 rounded-xl border border-pine/20 bg-sand/45 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyVote(vote === 1 ? 0 : 1)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${vote === 1 ? "bg-pine text-sand" : "bg-sand text-pine"}`}
            >
              ▲ Upvote
            </button>
            <span className="min-w-10 text-center text-sm font-semibold text-pine">{score}</span>
            <button
              type="button"
              onClick={() => applyVote(vote === -1 ? 0 : -1)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${vote === -1 ? "bg-pine text-sand" : "bg-sand text-pine"}`}
            >
              ▼ Downvote
            </button>
          </div>
          <p className="text-sm font-medium text-pine/80">{commentCountLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment"
            className="w-full rounded-lg border border-pine/25 bg-sand/80 px-3 py-2 text-sm text-pine outline-none placeholder:text-pine/50 focus:ring-2 focus:ring-pine/30"
          />
          <button
            type="button"
            onClick={addComment}
            className="rounded-lg bg-pine px-3 py-2 text-sm font-semibold text-sand hover:bg-pine-2"
          >
            Comment
          </button>
        </div>

        {comments.length > 0 && (
          <div className="mt-3 space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-pine/15 bg-sand/65 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-pine/70">{comment.author}</p>
                <p className="text-sm text-pine">{comment.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}