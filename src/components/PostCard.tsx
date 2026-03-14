"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Post } from "@/types/database";
import type { FeedView } from "./Feed";

type Comment = {
  id: string;
  author: string;
  body: string;
};

export default function PostCard({ post, view, emphasize = false }: { post: Post; view: FeedView; emphasize?: boolean }) {
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [score, setScore] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [isHoveringAuthor, setIsHoveringAuthor] = useState(false);

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

  const isBalanced = view === "balanced";

  return (
    <article className={`glass-card-strong ${isBalanced ? "h-full p-4" : `p-4 md:p-5 ${emphasize ? "md:p-6" : ""}`}`}>
      <div className="relative mb-4 flex items-center gap-3">
        {profile?.avatar_url ? (
          <Image src={profile.avatar_url} alt="User avatar" width={44} height={44} className="rounded-full border border-accent/30" />
        ) : (
          <div className="h-11 w-11 rounded-full border border-accent/30 bg-white/10" />
        )}

        <div onMouseEnter={() => setIsHoveringAuthor(true)} onMouseLeave={() => setIsHoveringAuthor(false)}>
          <p className="font-semibold text-accent">{profile?.username ?? "Unknown"}</p>
          <p className="text-xs text-muted">{new Date(post.created_at).toLocaleString()}</p>
        </div>

        {isHoveringAuthor ? (
          <div className="absolute left-0 top-12 z-10 w-64 rounded-2xl border border-accent/20 bg-bg/95 p-3 shadow-[0_16px_42px_rgba(0,0,0,0.4)]">
            <p className="text-sm font-semibold text-accent">{profile?.username ?? "Unknown"}</p>
            <p className="mt-1 text-xs text-muted">Quick profile preview</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-accent/15 bg-white/5 px-2 py-2">
                <p className="text-base font-semibold text-text">{comments.length}</p>
                <p className="text-muted">Replies</p>
              </div>
              <div className="rounded-xl border border-accent/15 bg-white/5 px-2 py-2">
                <p className="text-base font-semibold text-text">{Math.max(0, score)}</p>
                <p className="text-muted">Score</p>
              </div>
              <div className="rounded-xl border border-accent/15 bg-white/5 px-2 py-2">
                <p className="text-base font-semibold text-text">{profile?.avatar_url ? "✓" : "–"}</p>
                <p className="text-muted">Profile</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {post.title && <h2 className={`mb-2 font-semibold text-text ${isBalanced ? "text-base" : "text-xl"}`}>{post.title}</h2>}
      {post.content && <p className="mb-4 text-sm leading-6 text-text/90">{post.content}</p>}

      {post.media_url && (
        <Image
          src={post.media_url}
          alt="Post image"
          width={800}
          height={500}
          className={`w-full rounded-2xl border border-accent/20 object-cover ${isBalanced ? "h-44" : emphasize ? "max-h-155" : "max-h-130"}`}
        />
      )}

      <div className={`mt-4 rounded-2xl border border-accent/15 bg-bg/40 p-3 ${isBalanced ? "space-y-3" : ""}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyVote(vote === 1 ? 0 : 1)}
              className={`rounded-lg border px-3 py-1 text-sm font-semibold transition ${vote === 1 ? "border-accent/55 bg-accent/80 text-[#0f2f36]" : "border-accent/20 bg-white/5 text-text"}`}
            >
              ▲ Upvote
            </button>
            <span className="min-w-10 text-center text-sm font-semibold text-text/90">{score}</span>
            <button
              type="button"
              onClick={() => applyVote(vote === -1 ? 0 : -1)}
              className={`rounded-lg border px-3 py-1 text-sm font-semibold transition ${vote === -1 ? "border-brand-2/50 bg-brand-2/75 text-[#0f2f36]" : "border-accent/20 bg-white/5 text-text"}`}
            >
              ▼ Downvote
            </button>
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{commentCountLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment"
            className="w-full rounded-lg border border-accent/20 bg-white/5 px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent/35"
          />
          <button type="button" onClick={addComment} className="soft-button px-3 py-2 text-sm">
            Comment
          </button>
        </div>

        {comments.length > 0 && (
          <div className="mt-3 space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-accent/15 bg-white/5 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-accent/75">{comment.author}</p>
                <p className="text-sm text-text/90">{comment.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}