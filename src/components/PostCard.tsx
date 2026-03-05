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
    <article className="rounded-2xl border border-sand/20 bg-card/75 p-4 shadow-[0_24px_50px_-36px_rgba(0,0,0,0.95)] backdrop-blur transition hover:-translate-y-0.5 hover:border-sand/35">
      <div className="mb-3 flex items-center gap-3">
        {profile?.avatar_url && (
          <Image
            src={profile.avatar_url}
            alt="User avatar"
            width={40}
            height={40}
            className="rounded-full border border-sand/40"
          />
        )}

        <div>
          <p className="font-semibold text-sand">{profile?.username ?? "Unknown"}</p>
          <p className="text-sm text-text/65">{new Date(post.created_at).toLocaleString()}</p>
        </div>
      </div>

      {post.title && <h2 className="mb-2 text-lg font-bold text-text">{post.title}</h2>}

      {post.content && <p className="mb-3 text-text/90">{post.content}</p>}

      {post.media_url && (
        <Image
          src={post.media_url}
          alt="Post image"
          width={800}
          height={500}
          className="max-h-[500px] rounded-xl border border-sand/20 object-cover"
        />
      )}

      <div className="mt-4 rounded-xl border border-sand/15 bg-pine-2/55 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyVote(vote === 1 ? 0 : 1)}
              className={`rounded-lg border border-sand/25 px-3 py-1 text-sm font-semibold ${vote === 1 ? "bg-sand text-pine" : "bg-sand/15 text-sand"}`}
            >
              ▲ Upvote
            </button>
            <span className="min-w-10 text-center text-sm font-semibold text-text">{score}</span>
            <button
              type="button"
              onClick={() => applyVote(vote === -1 ? 0 : -1)}
              className={`rounded-lg border border-sand/25 px-3 py-1 text-sm font-semibold ${vote === -1 ? "bg-sand text-pine" : "bg-sand/15 text-sand"}`}
            >
              ▼ Downvote
            </button>
          </div>
          <p className="text-sm font-medium text-text/75">{commentCountLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment"
            className="w-full rounded-lg border border-sand/20 bg-sand/90 px-3 py-2 text-sm text-pine outline-none placeholder:text-pine/55 focus:ring-2 focus:ring-sand/35"
          />
          <button
            type="button"
            onClick={addComment}
            className="rounded-lg border border-sand/25 bg-sand/15 px-3 py-2 text-sm font-semibold text-sand transition hover:bg-sand/30"
          >
            Comment
          </button>
        </div>

        {comments.length > 0 && (
          <div className="mt-3 space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-sand/10 bg-card/80 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sand/70">{comment.author}</p>
                <p className="text-sm text-text">{comment.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}