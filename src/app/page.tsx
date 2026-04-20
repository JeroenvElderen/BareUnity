"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Ellipsis, Heart, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildUserScopedCacheKey, hasFreshCachedValue, readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { HomeFeedFriend, HomeFeedPayload, HomeFeedPost, HomeFeedStory } from "@/lib/homefeed";
import { sanitizeImageUpload } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

function normalizePostText(text: string) {
  const escapeHtml = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const formatInline = (value: string) =>
    value
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<ul class="my-2 list-disc pl-5">${listItems.join("")}</ul>`);
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      return;
    }

    const safeLine = escapeHtml(line);
    if (safeLine.startsWith("### ")) {
      flushList();
      html.push(`<h3 class="mt-3 text-base font-semibold">${formatInline(safeLine.slice(4))}</h3>`);
      return;
    }
    if (safeLine.startsWith("## ")) {
      flushList();
      html.push(`<h2 class="mt-3 text-lg font-semibold">${formatInline(safeLine.slice(3))}</h2>`);
      return;
    }
    if (safeLine.startsWith("# ")) {
      flushList();
      html.push(`<h1 class="mt-3 text-xl font-semibold">${formatInline(safeLine.slice(2))}</h1>`);
      return;
    }
    if (safeLine.startsWith("- ") || safeLine.startsWith("* ")) {
      listItems.push(`<li class="my-0.5">${formatInline(safeLine.slice(2))}</li>`);
      return;
    }

    flushList();
    html.push(`<p class="my-1">${formatInline(safeLine)}</p>`);
  });
  flushList();

  return html.join("");
}

const defaultFeed: HomeFeedPayload = {
  stories: [],
  friends: [],
  posts: [],
  viewerId: null,
};
const HOME_FEED_CACHE_MAX_AGE_MS = 1000 * 60 * 15;
const STORY_VIEW_MS = 7000;

export default function HomePage() {
  const [homeFeedCacheKey] = useState(() => buildUserScopedCacheKey("home-feed"));
  const [cachedFeed] = useState<HomeFeedPayload | null>(() =>
    readCachedValue<HomeFeedPayload>(homeFeedCacheKey, {
      maxAgeMs: HOME_FEED_CACHE_MAX_AGE_MS,
      allowExpired: true,
    }),
  );
  const [hasFreshCacheOnMount] = useState(() => hasFreshCachedValue(homeFeedCacheKey, HOME_FEED_CACHE_MAX_AGE_MS));
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"post" | "story" | null>(null);
  const [activeFeedTab, setActiveFeedTab] = useState<"following" | "forYou">("following");
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postImagePreview, setPostImagePreview] = useState<string>("");
  const [postImageDataUrl, setPostImageDataUrl] = useState<string>("");
  const galleryImageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraImageInputRef = useRef<HTMLInputElement | null>(null);
  const [feed, setFeed] = useState<HomeFeedPayload>(() => cachedFeed ?? defaultFeed);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isLoadingFeed, setLoadingFeed] = useState(() => !cachedFeed);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<HomeFeedPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ postId: string; commentId?: string } | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [storyTimerCycle, setStoryTimerCycle] = useState(0);

  const canPublish =
    composerKind === "story"
      ? Boolean(postImageDataUrl)
      : postTitle.trim().length > 0 && (postContent.trim().length > 0 || Boolean(postImageDataUrl));

  const postPreview = useMemo(() => {
    if (!postContent.trim()) return "";
    return normalizePostText(postContent);
  }, [postContent]);

  const getAuthHeaders = async (options?: { includeJsonContentType?: boolean }) => {
    const headers: HeadersInit = {};
    if (options?.includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return { headers, hasAuthToken: Boolean(accessToken) };
  };

  const loadFeed = useCallback(
    async (options?: { showSpinner?: boolean; attempt?: number }) => {
      if (options?.showSpinner) setLoadingFeed(true);
      try {
        const attempt = options?.attempt ?? 0;
        const { headers, hasAuthToken } = await getAuthHeaders();
        if (!hasAuthToken) {
          if (attempt < 6) {
            window.setTimeout(() => {
              void loadFeed({ ...options, attempt: attempt + 1 });
            }, 150);
          } else {
            setLoadingFeed(false);
          }
          return;
        }

        const response = await fetch("/api/homefeed", {
          cache: "no-store",
          headers,
        });

        if (!response.ok) {
          throw new Error(`Home feed request failed (${response.status})`);
        }

        const data = (await response.json()) as HomeFeedPayload;
        writeCachedValue(homeFeedCacheKey, data);
        setFeed(data);
      } catch {
        // Keep showing cached data when available. If neither cache nor network works, page keeps current state.
      } finally {
        setLoadingFeed(false);
      }
    },
    [homeFeedCacheKey],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const shouldRefresh = !cachedFeed || !hasFreshCacheOnMount;
      if (shouldRefresh) {
        void loadFeed();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cachedFeed, hasFreshCacheOnMount, loadFeed]);

  useEffect(() => {
    return () => {
      if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    };
  }, [postImagePreview]);

  useEffect(() => {
    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        void loadFeed();
      }, 500);
    };

    const liveFeedChannel = supabase.channel("homefeed-live-updates");
    ["posts", "comments", "friendships", "profiles"].forEach((table) => {
      liveFeedChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          scheduleRefresh();
        },
      );
    });

    void liveFeedChannel.subscribe();

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      void supabase.removeChannel(liveFeedChannel);
    };
  }, [loadFeed]);

  useEffect(() => {
    if (activeStoryIndex === null) return;

    const timer = window.setTimeout(() => {
      setActiveStoryIndex(null);
      setStoryTimerCycle(0);
    }, STORY_VIEW_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeStoryIndex, storyTimerCycle]);

  const publishPost = async () => {
    if (!canPublish || !composerKind) return;

    const response = await fetch("/api/homefeed", {
      method: "POST",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({ title: postTitle, content: postContent, mediaUrl: postImageDataUrl, kind: composerKind }),
    });

    if (!response.ok) return;

    setPostTitle("");
    setPostContent("");
    setPostImagePreview("");
    setPostImageDataUrl("");
    setComposerKind(null);
    setComposerOpen(false);
    await loadFeed();
  };

  const onPickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const sanitized = await sanitizeImageUpload(selectedFile, composerKind === "story" ? 1440 : 1920);
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    const preview = URL.createObjectURL(sanitized);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read image file"));
      reader.readAsDataURL(sanitized);
    });

    setPostImagePreview(preview);
    setPostImageDataUrl(dataUrl);
  };

  const toggleLike = async (postId: string) => {
    const response = await fetch(`/api/homefeed/posts/${postId}/like`, {
      method: "POST",
      headers: (await getAuthHeaders()).headers,
    });
    if (!response.ok) return;

    await loadFeed();
  };

  const addComment = async (postId: string) => {
    const value = commentDrafts[postId]?.trim();
    if (!value) return;

    const response = await fetch(`/api/homefeed/posts/${postId}/comments`, {
      method: "POST",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({ content: value }),
    });

    if (!response.ok) return;

    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    await loadFeed();
  };

  const openEditPostModal = (post: HomeFeedPost) => {
    const [existingTitle, ...existingContentLines] = post.text.split("\n");
    setEditingPost(post);
    setEditTitle(existingTitle ?? "");
    setEditContent(existingContentLines.join("\n"));
    setOpenPostMenuId(null);
  };

  const editPost = async () => {
    if (!editingPost) return;

    const response = await fetch(`/api/homefeed/posts/${editingPost.id}`, {
      method: "PATCH",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({ title: editTitle, content: editContent }),
    });

    if (!response.ok) return;
    setEditingPost(null);
    setEditTitle("");
    setEditContent("");
    setOpenPostMenuId(null);
    await loadFeed();
  };

  const openDeleteModal = (postId: string, commentId?: string) => {
    setDeleteTarget({ postId, commentId });
    setOpenPostMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const response = await fetch(
      deleteTarget.commentId
        ? `/api/homefeed/posts/${deleteTarget.postId}/comments/${deleteTarget.commentId}`
        : `/api/homefeed/posts/${deleteTarget.postId}`,
      {
        method: "DELETE",
        headers: (await getAuthHeaders()).headers,
      },
    );
    if (!response.ok) return;

    if (!deleteTarget.commentId && activePostId === deleteTarget.postId) setActivePostId(null);
    setDeleteTarget(null);
    await loadFeed();
  };

  const activePost = activePostId ? feed.posts.find((post) => post.id === activePostId) ?? null : null;
  const [activePostRawTitle, ...activePostBodyLines] = (activePost?.text ?? "").split("\n");
  const activePostTitle = activePostRawTitle?.trim() || "Untitled post";
  const activePostBody = activePostBodyLines.join("\n").trim();
  const posts = feed.posts;
  const stories: HomeFeedStory[] = feed.stories;
  const friends: HomeFeedFriend[] = feed.friends;
  const activeStory = activeStoryIndex !== null ? stories[activeStoryIndex] ?? null : null;
  const openStory = (index: number) => {
    if (!stories[index]) return;
    setActiveStoryIndex(index);
    setStoryTimerCycle(0);
  };

  const closeStory = () => {
    setActiveStoryIndex(null);
    setStoryTimerCycle(0);
  };

  const resetStoryTimer = () => {
    setStoryTimerCycle((current) => current + 1);
  };

  const onStoryViewerTap = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - bounds.left;

    if (tapX > bounds.width / 2) {
      closeStory();
      return;
    }

    resetStoryTimer();
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setComposerKind(null);
    setPostTitle("");
    setPostContent("");
    setPostImagePreview("");
    setPostImageDataUrl("");
  };

  return (
    <main className={styles.main}>
      <AppSidebar />
      
      <section className={styles.feedLayout}>
        <div className="w-full rounded-4xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 shadow-sm md:p-6">
          <header className="mb-4 flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Home feed</p>
              <h1 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Social dashboard</h1>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-1">
              <button
                type="button"
                onClick={() => setActiveFeedTab("following")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  activeFeedTab === "following"
                    ? "bg-white text-[rgb(var(--text-strong))] shadow-sm"
                    : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text-strong))]"
                }`}
              >
                Following
              </button>
              <button
                type="button"
                onClick={() => setActiveFeedTab("forYou")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  activeFeedTab === "forYou"
                    ? "bg-white text-[rgb(var(--text-strong))] shadow-sm"
                    : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text-strong))]"
                }`}
              >
                For you
              </button>
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Create
              </Button>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
            <div className="space-y-4">
              <Card className="border-0 bg-[#edf4ff]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Bare Moments</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2 overflow-x-auto pb-1 min-[1100px]:grid min-[1100px]:gap-3 min-[1100px]:grid-cols-4">
                  {stories.map((story, storyIndex) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => openStory(storyIndex)}
                      className="relative flex shrink-0 flex-col items-center gap-1 text-left min-[1100px]:items-stretch min-[1100px]:gap-0 min-[1100px]:overflow-hidden min-[1100px]:rounded-2xl min-[1100px]:border min-[1100px]:border-white/60 min-[1100px]:bg-white min-[1100px]:shadow-sm"
                    >
                      {story.imageUrl ? (
                        <img
                          src={story.imageUrl}
                          alt={`${story.name}'s story`}
                          className="hidden h-48 w-full object-cover min-[1100px]:block"
                        />
                      ) : (
                        <div className={`hidden min-[1100px]:block min-[1100px]:h-48 min-[1100px]:bg-linear-to-b ${story.tone}`} />
                      )}
                      <div className="rounded-full bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 p-0.5 min-[1100px]:absolute min-[1100px]:left-3 min-[1100px]:top-3">
                        <Avatar
                          alt={story.name}
                          fallback={story.fallback}
                          className="h-10 w-10 border-2 border-white min-[1100px]:h-10 min-[1100px]:w-10"
                        />
                      </div>
                      <p className="max-w-16 truncate text-center text-[11px] font-medium text-[rgb(var(--text-strong))] min-[1100px]:hidden">
                        {story.name.split(" ")[0]}
                      </p>
                      <p className="hidden min-[1100px]:absolute min-[1100px]:bottom-3 min-[1100px]:left-3 min-[1100px]:block min-[1100px]:text-sm min-[1100px]:font-semibold min-[1100px]:text-white">
                        {story.name}
                      </p>
                      <p className="hidden min-[1100px]:absolute min-[1100px]:bottom-0 min-[1100px]:right-3 min-[1100px]:block min-[1100px]:text-[11px] min-[1100px]:text-white/90">
                        {story.posted}
                      </p>
                    </button>
                  ))}
                  {stories.length === 0 && <p className="text-sm text-[rgb(var(--muted))]">No Bare Moments yet.</p>}
                </CardContent>
              </Card>

              {isLoadingFeed && posts.length === 0 ? (
                <Card className="border-0 bg-white">
                  <CardContent className="p-4 text-sm text-[rgb(var(--muted))]">Loading your feed…</CardContent>
                </Card>
              ) : null}

              {posts.map((post: HomeFeedPost) => {
                const [rawTitle] = post.text.split("\n");
                const title = rawTitle?.trim() || "Untitled post";

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
                      {feed.viewerId && post.authorId === feed.viewerId ? (
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="Open post actions"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
                            onClick={() => setOpenPostMenuId((current) => (current === post.id ? null : post.id))}
                          >
                            <Ellipsis className="h-4 w-4" />
                          </button>
                          {openPostMenuId === post.id ? (
                            <div className="absolute right-0 top-9 z-20 min-w-32 rounded-lg border border-[rgb(var(--border))] bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => openEditPostModal(post)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-soft))]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit post
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(post.id)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete post
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      </div>
                    <button type="button" onClick={() => setActivePostId(post.id)} className="mb-3 w-full text-left">
                      <h3 className="break-words text-2xl font-bold leading-tight text-[rgb(var(--text-strong))] [overflow-wrap:anywhere]">{title}</h3>
                    </button>
                    <button type="button" onClick={() => setActivePostId(post.id)} className="mb-4 block w-full text-left">
                      {post.mediaUrl ? (
                        <img
                          src={post.mediaUrl}
                          alt={`${post.author}'s post`}
                          className="h-130 w-full rounded-2xl bg-[rgb(var(--bg-soft))] object-contain"
                        />
                      ) : (
                        <span
                          className={`block h-130 w-full rounded-2xl bg-gradient-to-r ${post.tone}`}
                          aria-label={`Open full post from ${post.author}`}
                        />
                      )}
                    </button>
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
                      <Button size="sm" variant={post.likedByViewer ? "default" : "outline"} onClick={() => toggleLike(post.id)}>
                        <Heart className={`mr-1 h-4 w-4 ${post.likedByViewer ? "fill-current" : ""}`} />
                        Like ({post.likes})
                      </Button>
                      <button type="button" onClick={() => setActivePostId(post.id)}>
                        <Badge variant="outline" className="px-3 py-1 text-xs hover:bg-[rgb(var(--bg-soft))]">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />
                          {post.comments.length} comments
                        </Badge>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )})}
            </div>

            <aside className="hidden space-y-4 min-[1100px]:block">
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
                        </div>
                      </div>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${friend.status === "Online" ? "bg-emerald-500" : "bg-rose-400"}`}
                      />
                    </div>
                  ))}
                  {friends.length === 0 && <p className="text-sm text-[rgb(var(--muted))]">No friends added yet.</p>}
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
                <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
                  {composerKind === "story" ? "Create story" : "Create new post"}
                </h2>
                <p className="text-sm text-[rgb(var(--muted))]">
                  {composerKind === "story"
                    ? "Bare Moments expire after 24 hours and the image is removed automatically."
                    : "Use markdown: # heading, ## subheading, - bullet, **bold**, *italic*."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeComposer}
                aria-label="Close post composer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!composerKind ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 text-left hover:bg-white"
                  onClick={() => setComposerKind("post")}
                >
                  <p className="font-semibold text-[rgb(var(--text-strong))]">New post</p>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">Share text, markdown formatting, and an image.</p>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 text-left hover:bg-white"
                  onClick={() => setComposerKind("story")}
                >
                  <p className="font-semibold text-[rgb(var(--text-strong))]">New story</p>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">Photo story that expires after 24 hours.</p>
                </button>
              </div>
            ) : null}

            {composerKind ? (
            <div className="space-y-3">
              {composerKind === "post" ? (
                <input
                  type="text"
                  value={postTitle}
                  onChange={(event) => setPostTitle(event.target.value)}
                  placeholder="Post heading"
                  className="h-10 w-full rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                />
              ) : (
                <input
                  type="text"
                  value={postTitle}
                  onChange={(event) => setPostTitle(event.target.value)}
                  placeholder="Story caption (optional)"
                  className="h-10 w-full rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                />
              )}

              <textarea
                value={postContent}
                onChange={(event) => setPostContent(event.target.value)}
                className="min-h-40 w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                placeholder={composerKind === "story" ? "Add an optional story note..." : "Write your post content here..."}
              />

              <div className="space-y-2">
                <label className="block text-sm text-[rgb(var(--muted))]">
                  {composerKind === "story" ? "Story image (required)" : "Post image (optional)"}
                </label>
                {composerKind === "story" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (galleryImageInputRef.current) {
                            galleryImageInputRef.current.value = "";
                            galleryImageInputRef.current.click();
                          }
                        }}
                      >
                        Choose from gallery
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (cameraImageInputRef.current) {
                            cameraImageInputRef.current.value = "";
                            cameraImageInputRef.current.click();
                          }
                        }}
                      >
                        Use camera
                      </Button>
                    </div>
                    <input
                      ref={galleryImageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => void onPickImage(event)}
                      className="hidden"
                    />
                    <input
                      ref={cameraImageInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => void onPickImage(event)}
                      className="hidden"
                    />
                    <p className="text-xs text-[rgb(var(--muted))]">
                      Pick an existing photo or open your camera to take a new story image.
                    </p>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void onPickImage(event)}
                  />
                )}
                {postImagePreview ? (
                  <img src={postImagePreview} alt="Selected upload preview" className="max-h-64 w-full rounded-xl object-cover" />
                ) : null}
              </div>

              <div className="rounded-lg bg-[rgb(var(--bg-soft))] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Preview</p>
                {postPreview ? (
                  <div className="prose prose-sm max-w-none text-[rgb(var(--text))]" dangerouslySetInnerHTML={{ __html: postPreview }} />
                ) : (
                  <p className="text-sm text-[rgb(var(--muted))]">Start typing to preview formatted content.</p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeComposer}>
                  Cancel
                </Button>
                <Button onClick={publishPost} disabled={!canPublish}>
                  {composerKind === "story" ? "Publish story" : "Publish post"}
                </Button>
              </div>
            </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeStory ? (
        <div className="fixed inset-0 z-50 bg-black/85" role="dialog" aria-modal="true" aria-label={`${activeStory.name} story`} onClick={onStoryViewerTap}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4 sm:p-6">
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div
                key={storyTimerCycle}
                className="h-full rounded-full bg-white"
                style={{ animation: `story-progress ${STORY_VIEW_MS}ms linear forwards` }}
              />
            </div>
            <div className="mb-3 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Avatar alt={activeStory.name} fallback={activeStory.fallback} className="h-10 w-10 border border-white/70" />
                <div>
                  <p className="text-sm font-semibold">{activeStory.name}</p>
                  <p className="text-xs text-white/80">{activeStory.posted}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  closeStory();
                }}
                aria-label="Close story"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/50 text-white hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/40">
              {activeStory.imageUrl ? (
                <img src={activeStory.imageUrl} alt={`${activeStory.name} story`} className="h-full w-full object-contain" />
              ) : (
                <div className={`h-full w-full bg-gradient-to-br ${activeStory.tone}`} />
              )}
              <p className="absolute bottom-4 left-4 right-4 text-sm font-medium text-white drop-shadow">
                Tap left to reset timer · tap right to close
              </p>
            </div>
          </div>
          <style jsx global>{`
            @keyframes story-progress {
              from { width: 0%; }
              to { width: 100%; }
            }
          `}</style>
        </div>
      ) : null}

      {activePost ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar alt={activePost.author} fallback={activePost.fallback} className="h-11 w-11" />
                <div>
                  <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">{activePost.author}</p>
                  <p className="text-xs text-[rgb(var(--muted))]">{activePost.posted}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePostId(null)}
                aria-label="Close full post"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
              <h2 className="mb-3 break-words text-2xl font-bold leading-tight text-[rgb(var(--text-strong))] [overflow-wrap:anywhere]">{activePostTitle}</h2>
              {activePost.mediaUrl ? (
                <img
                  src={activePost.mediaUrl}
                  alt={`${activePost.author}'s full post`}
                  className="mb-4 h-[32.5rem] w-full rounded-2xl bg-[rgb(var(--bg-soft))] object-contain"
                />
              ) : (
                <div className={`mb-4 h-[32.5rem] rounded-2xl bg-gradient-to-r ${activePost.tone}`} />
              )}
              {activePostBody ? (
                <p className="mb-4 whitespace-pre-line break-words [overflow-wrap:anywhere] text-sm text-[rgb(var(--text))]">{activePostBody}</p>
              ) : null}

            </div>

            <div className="mt-2 space-y-2 border-t border-[rgb(var(--border))] bg-white pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={activePost.likedByViewer ? "default" : "outline"} onClick={() => toggleLike(activePost.id)}>
                  <Heart className={`mr-1 h-4 w-4 ${activePost.likedByViewer ? "fill-current" : ""}`} />
                  Like ({activePost.likes})
                </Button>
                <Badge variant="outline" className="px-3 py-1 text-xs">
                  <MessageCircle className="mr-1 h-3.5 w-3.5" />
                  {activePost.comments.length} comments
                </Badge>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {activePost.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[rgb(var(--bg-soft))] px-3 py-2 text-sm text-[rgb(var(--text))]"
                  >
                    <span className="break-words [overflow-wrap:anywhere]">{comment.content}</span>
                    {feed.viewerId && comment.authorId === feed.viewerId ? (
                      <button
                        type="button"
                        onClick={() => openDeleteModal(activePost.id, comment.id)}
                        className="text-xs font-medium text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentDrafts[activePost.id] ?? ""}
                  onChange={(event) => setCommentDrafts((current) => ({ ...current, [activePost.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addComment(activePost.id);
                    }
                  }}
                  placeholder="Write a comment..."
                  className="h-9 flex-1 rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                />
                <Button size="sm" onClick={() => addComment(activePost.id)}>
                  Post
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingPost ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-2xl border border-[rgb(var(--border))] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Edit post</h2>
                <p className="text-sm text-[rgb(var(--muted))]">Adjust your post title and body text. Image changes are not available.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPost(null);
                  setEditTitle("");
                  setEditContent("");
                }}
                aria-label="Close edit post dialog"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Post heading"
                className="h-10 w-full rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
              />
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                className="min-h-40 w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                placeholder="Write your post content here..."
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingPost(null);
                    setEditTitle("");
                    setEditContent("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editPost}>Save changes</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Delete {deleteTarget.commentId ? "comment" : "post"}?</h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {deleteTarget.commentId ? "Are you sure you want to delete this comment?" : "Are you sure you want to delete this post? This action cannot be undone."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
