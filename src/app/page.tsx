"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, X } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "./page.module.css";

type Story = {
  id: number;
  name: string;
  fallback: string;
  tone: string;
};

type Friend = {
  id: number;
  name: string;
  fallback: string;
  status: "Online" | "Offline";
};

type Post = {
  id: number;
  author: string;
  fallback: string;
  posted: string;
  text: string;
  likes: number;
  comments: string[];
  tone: string;
};

const stories: Story[] = [
  { id: 1, name: "Jenifer Caper", fallback: "JC", tone: "from-violet-600/75 to-indigo-900/90" },
  { id: 2, name: "Della Femanel", fallback: "DF", tone: "from-amber-500/70 to-orange-900/90" },
  { id: 3, name: "Rebecca Tarley", fallback: "RT", tone: "from-cyan-500/70 to-sky-900/90" },
  { id: 4, name: "Garry Brasel", fallback: "GB", tone: "from-fuchsia-500/75 to-violet-950/90" },
];

const friends: Friend[] = [
  { id: 1, name: "Stefania Backer", fallback: "SB", status: "Online" },
  { id: 2, name: "Louis Sheldon", fallback: "LS", status: "Online" },
  { id: 3, name: "Allan Butler", fallback: "AB", status: "Offline" },
  { id: 4, name: "Carl Murphy", fallback: "CM", status: "Offline" },
];

const starterPosts: Post[] = [
  {
    id: 1,
    author: "Kimberly Mason",
    fallback: "KM",
    posted: "1 day ago",
    text: "This weekend was unforgettable. Thanks my friends <3",
    likes: 17,
    comments: ["Looks like such a great weekend!", "Love this energy 🔥"],
    tone: "from-cyan-400/80 via-sky-400/70 to-indigo-600/80",
  },
];

function normalizePostText(text: string) {
  return text
    .replace(/^###\s(.+)$/gm, "<h3 class='text-base font-semibold mt-3'>$1</h3>")
    .replace(/^##\s(.+)$/gm, "<h2 class='text-lg font-semibold mt-3'>$1</h2>")
    .replace(/^#\s(.+)$/gm, "<h1 class='text-xl font-semibold mt-3'>$1</h1>")
    .replace(/^[-*]\s(.+)$/gm, "<li class='ml-5 list-disc'>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

export default function HomePage() {
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [posts, setPosts] = useState<Post[]>(starterPosts);
  const [likedPostIds, setLikedPostIds] = useState<number[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});

  const canPublish = postTitle.trim().length > 0 && postContent.trim().length > 0;

  const postPreview = useMemo(() => {
    if (!postContent.trim()) return "";
    return normalizePostText(postContent);
  }, [postContent]);

  const publishPost = () => {
    if (!canPublish) return;

    const newPost: Post = {
      id: Date.now(),
      author: "You",
      fallback: "YO",
      posted: "Just now",
      text: `${postTitle}\n${postContent}`,
      likes: 0,
      comments: [],
      tone: "from-teal-400/80 via-emerald-400/70 to-cyan-500/80",
    };

    setPosts((currentPosts) => [newPost, ...currentPosts]);
    setPostTitle("");
    setPostContent("");
    setComposerOpen(false);
  };

  const toggleLike = (postId: number) => {
    const alreadyLiked = likedPostIds.includes(postId);

    setLikedPostIds((currentLikedIds) =>
      alreadyLiked ? currentLikedIds.filter((likedPostId) => likedPostId !== postId) : [...currentLikedIds, postId],
    );

    setPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          likes: Math.max(0, post.likes + (alreadyLiked ? -1 : 1)),
        };
      }),
    );
  };

  const addComment = (postId: number) => {
    const value = commentDrafts[postId]?.trim();
    if (!value) return;

    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? { ...post, comments: [...post.comments, value] } : post)),
    );
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
  };

  return (
    <main className={styles.main}>
      <AppSidebar />
      
      <section className={styles.feedLayout}>
        <div className="w-full rounded-[2rem] border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 shadow-sm md:p-6">
          <header className="mb-4 flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Home feed</p>
              <h1 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Social dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline">
                Following
              </Button>
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Create
              </Button>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
            <div className="space-y-4">
              <Card className="border-0 bg-[#edf4ff]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Stories</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {stories.map((story) => (
                    <article key={story.id} className="relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
                      <div className={`h-48 bg-gradient-to-b ${story.tone}`} />
                      <div className="absolute left-3 top-3">
                        <Avatar alt={story.name} fallback={story.fallback} className="h-10 w-10 border-white" />
                      </div>
                      <p className="absolute bottom-3 left-3 text-sm font-semibold text-white">{story.name}</p>
                    </article>
                  ))}
                </CardContent>
              </Card>

              {posts.map((post) => {
                const liked = likedPostIds.includes(post.id);
                return (
                  <Card key={post.id} className="border-0 bg-white">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar alt={post.author} fallback={post.fallback} className="h-11 w-11" />
                          <div>
                            <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">{post.author}</p>
                            <p className="text-xs text-[rgb(var(--muted))]">{post.posted}</p>
                          </div>
                        </div>
                        <button type="button" className="text-sm text-[rgb(var(--muted))]">
                          •••
                        </button>
                      </div>
                      <p className="mb-3 whitespace-pre-line text-sm text-[rgb(var(--text))]">{post.text}</p>
                      <div className={`mb-4 h-56 rounded-2xl bg-gradient-to-r ${post.tone}`} />

                      <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
                        <Button size="sm" variant={liked ? "default" : "outline"} onClick={() => toggleLike(post.id)}>
                          <Heart className={`mr-1 h-4 w-4 ${liked ? "fill-current" : ""}`} />
                          Like ({post.likes})
                        </Button>
                        <Badge variant="outline" className="px-3 py-1 text-xs">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />
                          {post.comments.length} comments
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        {post.comments.map((comment, idx) => (
                          <div
                            key={`${post.id}-${idx}`}
                            className="rounded-lg bg-[rgb(var(--bg-soft))] px-3 py-2 text-sm text-[rgb(var(--text))]"
                          >
                            {comment}
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={commentDrafts[post.id] ?? ""}
                            onChange={(event) =>
                              setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addComment(post.id);
                              }
                            }}
                            placeholder="Write a comment..."
                            className="h-9 flex-1 rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                          />
                          <Button size="sm" onClick={() => addComment(post.id)}>
                            Post
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <aside className="space-y-4">
              <Card className="border-0 bg-[#eaf3ff]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Friends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar alt={friend.name} fallback={friend.fallback} className="h-10 w-10" />
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">{friend.name}</p>
                          <p className="text-xs text-[rgb(var(--muted))]">{friend.status}</p>
                        </div>
                      </div>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${friend.status === "Online" ? "bg-emerald-500" : "bg-rose-400"}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 bg-white">
                <CardContent className="p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Quick links</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/gallery">Gallery</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/explore">Explore</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/profile">Profile</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </section>

      {isComposerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl border border-[rgb(var(--border))] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Create new post</h2>
                <p className="text-sm text-[rgb(var(--muted))]">Supports markdown styling: headings (#), bullet points (-), bold (**text**).</p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close post composer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={postTitle}
                onChange={(event) => setPostTitle(event.target.value)}
                placeholder="Post heading"
                className="h-10 w-full rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
              />

              <div className="grid grid-cols-3 gap-2 text-xs text-[rgb(var(--muted))] sm:grid-cols-6">
                {[
                  { label: "Heading", token: "# Heading" },
                  { label: "Bullet", token: "- Bullet point" },
                  { label: "Bold", token: "**bold text**" },
                  { label: "Italic", token: "*italic text*" },
                  { label: "Subheading", token: "## Subheading" },
                  { label: "List", token: "- First\n- Second" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-2 py-1"
                    onClick={() => setPostContent((current) => `${current}${current ? "\n" : ""}${option.token}`)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <textarea
                value={postContent}
                onChange={(event) => setPostContent(event.target.value)}
                className="min-h-40 w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                placeholder="Write your post content here..."
              />

              <div className="rounded-lg bg-[rgb(var(--bg-soft))] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Preview</p>
                {postPreview ? (
                  <div
                    className="prose prose-sm max-w-none text-[rgb(var(--text))]"
                    dangerouslySetInnerHTML={{ __html: postPreview }}
                  />
                ) : (
                  <p className="text-sm text-[rgb(var(--muted))]">Start typing to preview formatted content.</p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setComposerOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={publishPost} disabled={!canPublish}>
                  Publish post
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
