"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from "react";
import { ChevronDown, Ellipsis, Heart, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildUserScopedCacheKey, hasFreshCachedValue, readCachedValue, writeCachedValue } from "@/lib/client-cache";
import type { HomeFeedComment, HomeFeedFriend, HomeFeedPayload, HomeFeedPost, HomeFeedStory } from "@/lib/homefeed";
import { sanitizeImageUpload } from "@/lib/image";
import { HOME_FEED_REALTIME_TABLES, subscribeToTables } from "@/lib/realtime";
import { takePrefetchedRouteData } from "@/lib/prefetched-route-data";
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
const STORY_HOLD_MIN_MS = 180;
type LikePreviewUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export default function HomePage() {
  const [homeFeedCacheKey] = useState(() => buildUserScopedCacheKey("home-feed"));
  const [cachedFeed] = useState<HomeFeedPayload | null>(() =>
    readCachedValue<HomeFeedPayload>(homeFeedCacheKey, {
      maxAgeMs: HOME_FEED_CACHE_MAX_AGE_MS,
      allowExpired: true,
    }),
  );
  const [prefetchedFeed] = useState<HomeFeedPayload | null>(() => takePrefetchedRouteData<HomeFeedPayload>("homefeed"));
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
  const [feed, setFeed] = useState<HomeFeedPayload>(() => prefetchedFeed ?? cachedFeed ?? defaultFeed);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [activeReplyByPost, setActiveReplyByPost] = useState<Record<string, string | null>>({});
  const [expandedCommentThreadsByPost, setExpandedCommentThreadsByPost] = useState<Record<string, Record<string, boolean>>>({});
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isLoadingFeed, setLoadingFeed] = useState(() => !prefetchedFeed && !cachedFeed);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<HomeFeedPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [editImageDataUrl, setEditImageDataUrl] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ postId: string; commentId?: string } | null>(null);
  const [openLikesPostId, setOpenLikesPostId] = useState<string | null>(null);
  const [likesByPost, setLikesByPost] = useState<Record<string, LikePreviewUser[]>>({});
  const [likesLoadingPostId, setLikesLoadingPostId] = useState<string | null>(null);
  const [expandedCaptionsByPost, setExpandedCaptionsByPost] = useState<Record<string, boolean>>({});
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(null);
  const [storyTimerCycle, setStoryTimerCycle] = useState(0);
  const [storyTimeRemainingMs, setStoryTimeRemainingMs] = useState(STORY_VIEW_MS);
  const [isStoryTimerPaused, setStoryTimerPaused] = useState(false);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(() => new Set());
  const storyTimerStartedAtRef = useRef<number | null>(null);
  const storyHoldStartedAtRef = useRef<number | null>(null);
  const suppressStoryTapRef = useRef(false);

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
      const shouldRefresh = (!cachedFeed && !prefetchedFeed) || !hasFreshCacheOnMount;
      if (shouldRefresh) {
        void loadFeed();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cachedFeed, hasFreshCacheOnMount, loadFeed, prefetchedFeed]);

  useEffect(() => {
    return () => {
      if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    };
  }, [postImagePreview]);

  useEffect(() => {
    return subscribeToTables({
      channelName: "homefeed-live-updates",
      client: supabase,
      tables: HOME_FEED_REALTIME_TABLES,
      onChange: () => {
        void loadFeed();
      },
      debounceMs: 500,
    });
  }, [loadFeed]);

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
    const targetPost = feed.posts.find((post) => post.id === postId);
    if (!targetPost) return;
    
    const response = await fetch(`/api/homefeed/posts/${postId}/like`, {
      method: "POST",
      headers: (await getAuthHeaders()).headers,
    });
    if (!response.ok) return;

    const payload = (await response.json()) as { liked?: boolean };
    const liked = Boolean(payload.liked);
    const likeDelta = liked ? (targetPost.likedByViewer ? 0 : 1) : targetPost.likedByViewer ? -1 : 0;

    if (!likeDelta && targetPost.likedByViewer === liked) return;

    setFeed((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByViewer: liked,
              likes: Math.max(0, post.likes + likeDelta),
            }
          : post,
      ),
    }));
  };

  const addComment = async (postId: string, options?: { parentId?: string | null }) => {
    const parentId = options?.parentId ?? null;
    const value = commentDrafts[postId]?.trim();
    if (!value) return;

    const response = await fetch(`/api/homefeed/posts/${postId}/comments`, {
      method: "POST",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({ content: value, parentId }),
    });

    if (!response.ok) return;

    const payload = (await response.json()) as {
      comment?: {
        id: string;
        content: string;
        authorId: string | null;
        authorName: string;
        authorFallback: string;
        authorAvatarUrl: string | null;
        parentId: string | null;
      };
    };
    const newComment = payload.comment;
    if (!newComment) return;

    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    if (parentId) setActiveReplyByPost((current) => ({ ...current, [postId]: null }));
    setFeed((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [...post.comments, newComment],
            }
          : post,
      ),
    }));
  };

  const fetchPostLikes = async (postId: string) => {
    setLikesLoadingPostId(postId);
    const response = await fetch(`/api/homefeed/posts/${postId}/like`, {
      method: "GET",
      headers: (await getAuthHeaders()).headers,
    });
    setLikesLoadingPostId(null);
    if (!response.ok) return;

    const payload = (await response.json()) as { likes?: LikePreviewUser[] };
    setLikesByPost((current) => ({ ...current, [postId]: payload.likes ?? [] }));
  };

  const toggleLikesDropdown = async (postId: string) => {
    const opening = openLikesPostId !== postId;
    setOpenLikesPostId(opening ? postId : null);
    if (!opening) return;

    if (!likesByPost[postId]) {
      await fetchPostLikes(postId);
    }
  };

  const openEditPostModal = (post: HomeFeedPost) => {
    const [existingTitle, ...existingContentLines] = post.text.split("\n");
    setEditingPost(post);
    setEditTitle(existingTitle ?? "");
    setEditContent(existingContentLines.join("\n"));
    setEditImagePreview(post.mediaUrl ?? "");
    setEditImageDataUrl("");
    setOpenPostMenuId(null);
  };

  const onPickEditImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const sanitized = await sanitizeImageUpload(selectedFile, 1920);
    if (editImagePreview.startsWith("blob:")) URL.revokeObjectURL(editImagePreview);
    const preview = URL.createObjectURL(sanitized);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read image file"));
      reader.readAsDataURL(sanitized);
    });

    setEditImagePreview(preview);
    setEditImageDataUrl(dataUrl);
  };

  const editPost = async () => {
    if (!editingPost) return;

    const response = await fetch(`/api/homefeed/posts/${editingPost.id}`, {
      method: "PATCH",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({ title: editTitle, content: editContent, mediaUrl: editImageDataUrl }),
    });

    if (!response.ok) return;
    if (editImagePreview.startsWith("blob:")) URL.revokeObjectURL(editImagePreview);
    setEditingPost(null);
    setEditTitle("");
    setEditContent("");
    setEditImagePreview("");
    setEditImageDataUrl("");
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

  const rootCommentsForPost = useCallback((post: HomeFeedPost) => {
    const knownIds = new Set(post.comments.map((comment) => comment.id));
    return post.comments.filter((comment) => !comment.parentId || !knownIds.has(comment.parentId));
  }, []);
  const getChildComments = useCallback(
    (comments: HomeFeedComment[], parentId: string) => comments.filter((comment) => comment.parentId === parentId),
    [],
  );

  const activePost = activePostId ? feed.posts.find((post) => post.id === activePostId) ?? null : null;
  const posts = feed.posts;
  const stories: HomeFeedStory[] = feed.stories;
  const friends: HomeFeedFriend[] = feed.friends;
  const groupedStories = useMemo(() => {
    const grouped = new Map<string, HomeFeedStory[]>();
    stories.forEach((story) => {
      const existing = grouped.get(story.authorId) ?? [];
      existing.push(story);
      grouped.set(story.authorId, existing);
    });
    grouped.forEach((authorStories, authorId) => {
      const orderedStories = [...authorStories].sort(
        (firstStory, secondStory) =>
          new Date(firstStory.createdAt).getTime() - new Date(secondStory.createdAt).getTime(),
      );
      grouped.set(authorId, orderedStories);
    });
    return grouped;
  }, [stories]);
  const storyCards = useMemo(() => {
    const cards: HomeFeedStory[] = [];
    groupedStories.forEach((authorStories) => {
      if (!authorStories.length) return;
      const firstUnseenStory = authorStories.find((story) => !seenStoryIds.has(story.id));
      cards.push(firstUnseenStory ?? authorStories[authorStories.length - 1]!);
    });
    return cards;
  }, [groupedStories, seenStoryIds]);
  const activeStorySeries = useMemo(
    () => (activeStoryAuthorId ? groupedStories.get(activeStoryAuthorId) ?? [] : []),
    [activeStoryAuthorId, groupedStories],
  );
  const activeStory = activeStoryIndex !== null ? activeStorySeries[activeStoryIndex] ?? null : null;
  const openStory = (authorId: string) => {
    const authorStories = groupedStories.get(authorId) ?? [];
    if (!authorStories.length) return;
    const firstUnseenStoryIndex = authorStories.findIndex((story) => !seenStoryIds.has(story.id));
    const startIndex = firstUnseenStoryIndex >= 0 ? firstUnseenStoryIndex : authorStories.length - 1;
    setActiveStoryAuthorId(authorId);
    setActiveStoryIndex(startIndex);
    setStoryTimerPaused(false);
    setStoryTimeRemainingMs(STORY_VIEW_MS);
    setStoryTimerCycle((current) => current + 1);
  };

  const closeStory = () => {
    setActiveStoryAuthorId(null);
    setActiveStoryIndex(null);
    setStoryTimerCycle(0);
    setStoryTimerPaused(false);
    setStoryTimeRemainingMs(STORY_VIEW_MS);
    storyTimerStartedAtRef.current = null;
  };

  const resetStoryTimer = () => {
    setStoryTimerPaused(false);
    setStoryTimeRemainingMs(STORY_VIEW_MS);
    setStoryTimerCycle((current) => current + 1);
  };

  const goToPreviousStory = () => {
    if (activeStoryIndex === null) return;
    if (activeStoryIndex <= 0) {
      resetStoryTimer();
      return;
    }
    setActiveStoryIndex((current) => (current === null ? null : current - 1));
    setStoryTimerPaused(false);
    setStoryTimeRemainingMs(STORY_VIEW_MS);
    setStoryTimerCycle((current) => current + 1);
  };

  const goToNextStory = useCallback(() => {
    if (activeStoryIndex === null) return;
    const nextIndex = activeStoryIndex + 1;
    if (!activeStorySeries[nextIndex]) {
      closeStory();
      return;
    }
    setActiveStoryIndex(nextIndex);
    setStoryTimerPaused(false);
    setStoryTimeRemainingMs(STORY_VIEW_MS);
    setStoryTimerCycle((current) => current + 1);
  }, [activeStoryIndex, activeStorySeries]);

  useEffect(() => {
    if (!activeStory || isStoryTimerPaused) return;

    storyTimerStartedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      goToNextStory();
    }, storyTimeRemainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeStory, goToNextStory, isStoryTimerPaused, storyTimeRemainingMs]);

  useEffect(() => {
    if (!activeStory?.id) return;
    setSeenStoryIds((current) => {
      if (current.has(activeStory.id)) return current;
      const updated = new Set(current);
      updated.add(activeStory.id);
      return updated;
    });
  }, [activeStory]);
  
  const onStoryViewerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isStoryTimerPaused || !activeStory) return;
    storyHoldStartedAtRef.current = Date.now();
    suppressStoryTapRef.current = false;
    const startedAt = storyTimerStartedAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    setStoryTimeRemainingMs((current) => Math.max(0, current - elapsed));
    setStoryTimerPaused(true);
    storyTimerStartedAtRef.current = null;
  };

  const onStoryViewerPointerUp = () => {
    if (!activeStory) return;
    const holdStartedAt = storyHoldStartedAtRef.current;
    if (holdStartedAt !== null && Date.now() - holdStartedAt >= STORY_HOLD_MIN_MS) {
      suppressStoryTapRef.current = true;
    }
    storyHoldStartedAtRef.current = null;
    setStoryTimerPaused(false);
  };

  const onStoryViewerPointerCancel = () => {
    if (!activeStory) return;
    storyHoldStartedAtRef.current = null;
    suppressStoryTapRef.current = true;
    setStoryTimerPaused(false);
  };

  const onStoryViewerTap = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressStoryTapRef.current) {
      suppressStoryTapRef.current = false;
      return;
    }
    if (isStoryTimerPaused) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - bounds.left;

    if (tapX > bounds.width / 2) {
      goToNextStory();
      return;
    }

    goToPreviousStory();
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
          <header className={`${styles.feedHeader} mb-4 rounded-2xl border border-[rgb(var(--border))] bg-white px-4 py-3`}>
            <div className={styles.feedHeaderTitleBlock}>
              <p className="text-xs uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Home feed</p>
              <h1 className="text-lg font-semibold text-[rgb(var(--text-strong))]">Social dashboard</h1>
            </div>
            <div className={styles.feedHeaderControls}>
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
              <Button size="sm" onClick={() => setComposerOpen(true)} className={styles.feedCreateButton}>
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
                  {storyCards.map((story) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => openStory(story.authorId)}
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
                  {storyCards.length === 0 && <p className="text-sm text-[rgb(var(--muted))]">No Bare Moments yet.</p>}
                </CardContent>
              </Card>

              {isLoadingFeed && posts.length === 0 ? (
                <Card className="border-0 bg-white">
                  <CardContent className="p-4 text-sm text-[rgb(var(--muted))]">Loading your feed…</CardContent>
                </Card>
              ) : null}

              {posts.map((post: HomeFeedPost) => {
                const caption = post.text.trim();
                const isCaptionExpanded = Boolean(expandedCaptionsByPost[post.id]);
                const shouldClampCaption = caption.length > 160 || caption.includes("\n");

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
                    <div className="mb-4 block w-full text-left">
                      {post.mediaUrl ? (
                        <img
                          src={post.mediaUrl}
                          alt={`${post.author}'s post`}
                          className="h-130 w-full rounded-2xl bg-[rgb(var(--bg-soft))] object-contain"
                        />
                      ) : null}
                    </div>
                    {caption ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCaptionsByPost((current) => ({ ...current, [post.id]: !current[post.id] }))
                        }
                        className="mb-3 block w-full text-left"
                        aria-expanded={isCaptionExpanded}
                        aria-label={isCaptionExpanded ? "Collapse caption" : "Expand caption"}
                      >
                        <p
                          className="whitespace-pre-line break-words text-sm text-[rgb(var(--text))] [overflow-wrap:anywhere]"
                          style={
                            !isCaptionExpanded && shouldClampCaption
                              ? {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }
                              : undefined
                          }
                        >
                          <span className="mr-1 font-semibold text-[rgb(var(--text-strong))]">{post.author}</span>
                          {caption}
                        </p>
                        {shouldClampCaption ? (
                          <span className="mt-1 inline-block text-xs font-medium text-[rgb(var(--muted))]">
                            {isCaptionExpanded ? "Show less" : "Show more"}
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
                      <Button size="sm" variant={post.likedByViewer ? "default" : "outline"} onClick={() => toggleLike(post.id)}>
                        <Heart className={`mr-1 h-4 w-4 ${post.likedByViewer ? "fill-current" : ""}`} />
                        Like ({post.likes})
                      </Button>
                      {feed.viewerId && post.authorId === feed.viewerId ? (
                        <div className="relative">
                          <Button size="sm" variant="outline" onClick={() => void toggleLikesDropdown(post.id)}>
                            Liked by
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Button>
                          {openLikesPostId === post.id ? (
                            <div className="absolute right-0 top-10 z-20 w-60 max-w-[calc(100vw-2.5rem)] rounded-lg border border-[rgb(var(--border))] bg-white p-2 shadow-lg sm:left-0 sm:right-auto sm:max-w-none">
                              {likesLoadingPostId === post.id ? (
                                <p className="px-2 py-1 text-xs text-[rgb(var(--muted))]">Loading likes...</p>
                              ) : likesByPost[post.id]?.length ? (
                                <div className="max-h-48 space-y-1 overflow-y-auto">
                                  {likesByPost[post.id].map((user) => (
                                    <div key={user.userId} className="flex items-center gap-2 rounded-md px-2 py-1">
                                      <Avatar src={user.avatarUrl ?? undefined} alt={user.name} fallback={user.name.slice(0, 2).toUpperCase()} className="h-7 w-7" />
                                      <span className="text-xs font-medium text-[rgb(var(--text-strong))]">{user.name}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="px-2 py-1 text-xs text-[rgb(var(--muted))]">No likes yet.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
        <div
          className="fixed inset-0 z-50 bg-black/85"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeStory.name} story`}
          onClick={onStoryViewerTap}
          onPointerDown={onStoryViewerPointerDown}
          onPointerUp={onStoryViewerPointerUp}
          onPointerCancel={onStoryViewerPointerCancel}
        >
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-4 sm:p-6">
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div
                key={storyTimerCycle}
                className="h-full rounded-full bg-white"
                style={{
                  animation: `story-progress ${STORY_VIEW_MS}ms linear forwards`,
                  animationPlayState: isStoryTimerPaused ? "paused" : "running",
                }}
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
                Tap right for next · tap left for previous · press and hold to pause
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
        <div className="fixed inset-0 z-50 bg-white" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border-x border-[rgb(var(--border))] bg-white">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[rgb(var(--border))] bg-white px-4 py-3">
              <div>
                <p className="text-base font-semibold text-[rgb(var(--text-strong))]">Comments</p>
                <p className="text-xs text-[rgb(var(--muted))]">{activePost.comments.length} total</p>
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

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-3">
                <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">{activePost.author}</p>
                {activePost.mediaUrl ? (
                  <img
                    src={activePost.mediaUrl}
                    alt={`${activePost.author}'s post`}
                    className="mt-3 max-h-[28rem] w-full rounded-xl bg-white object-contain"
                  />
                ) : null}
                {activePost.text ? <p className="mt-1 whitespace-pre-line text-sm text-[rgb(var(--text))]">{activePost.text}</p> : null}
              </div>
              <div className="space-y-2 pb-4">
                {rootCommentsForPost(activePost).map((comment) => {
                  const renderComment = (node: HomeFeedComment, depth: number, visited: Set<string>) => {
                    if (visited.has(node.id)) return null;
                    const nextVisited = new Set(visited);
                    nextVisited.add(node.id);
                    const children = getChildComments(activePost.comments, node.id);
                    const areRepliesExpanded = Boolean(expandedCommentThreadsByPost[activePost.id]?.[node.id]);
                    const visibleChildren = areRepliesExpanded ? children : [];
                    const commentAuthorName = node.authorName || "Community member";
                    const commentFallback = node.authorFallback || "BU";

                    return (
                      <div key={node.id} className="space-y-2">
                        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <Avatar src={node.authorAvatarUrl ?? undefined} alt={commentAuthorName} fallback={commentFallback} className="h-8 w-8" />
                              <div>
                                <p className="text-xs font-semibold text-[rgb(var(--text-strong))]">{commentAuthorName}</p>
                                <p className="text-sm text-[rgb(var(--text))] break-words [overflow-wrap:anywhere]">{node.content}</p>
                              </div>
                            </div>
                            {feed.viewerId && node.authorId === feed.viewerId ? (
                              <button type="button" onClick={() => openDeleteModal(activePost.id, node.id)} className="text-xs font-medium text-rose-600 hover:underline">
                                Delete
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-1 pl-10">
                            <button
                              type="button"
                              className="text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text-strong))]"
                              onClick={() =>
                                setActiveReplyByPost((current) => ({
                                  ...current,
                                  [activePost.id]: current[activePost.id] === node.id ? null : node.id,
                                }))
                              }
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                        {children.length ? (
                          <button
                            type="button"
                            className={`text-xs font-semibold text-blue-600 hover:underline ${depth === 0 ? "ml-10" : "ml-6"}`}
                            onClick={() =>
                              setExpandedCommentThreadsByPost((current) => ({
                                ...current,
                                [activePost.id]: {
                                  ...(current[activePost.id] ?? {}),
                                  [node.id]: !areRepliesExpanded,
                                },
                              }))
                            }
                          >
                            {areRepliesExpanded ? "Hide replies" : `${children.length} more repl${children.length === 1 ? "y" : "ies"}`}
                          </button>
                        ) : null}
                        {visibleChildren.length ? (
                          <div className={`space-y-2 border-l border-[rgb(var(--border))] pl-3 ${depth === 0 ? "ml-10" : "ml-6"}`}>
                            {visibleChildren.map((child) => renderComment(child, depth + 1, nextVisited))}
                          </div>
                        ) : null}
                      </div>
                      );
                  };

                  return renderComment(comment, 0, new Set());
                })}
              </div>
              </div>
            <div className="sticky bottom-0 z-10 space-y-2 border-t border-[rgb(var(--border))] bg-white px-4 py-3">
              {activeReplyByPost[activePost.id] ? (
                <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-3 py-2">
                  <p className="text-xs text-[rgb(var(--muted))]">
                    Replying to{" "}
                    <span className="font-semibold text-[rgb(var(--text-strong))]">
                      {activePost.comments.find((comment) => comment.id === activeReplyByPost[activePost.id])?.authorName || "Community member"}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text-strong))]"
                    onClick={() =>
                      setActiveReplyByPost((current) => ({
                        ...current,
                        [activePost.id]: null,
                      }))
                    }
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentDrafts[activePost.id] ?? ""}
                  onChange={(event) => setCommentDrafts((current) => ({ ...current, [activePost.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addComment(activePost.id, { parentId: activeReplyByPost[activePost.id] ?? null });
                    }
                  }}
                  placeholder={activeReplyByPost[activePost.id] ? "Write a reply..." : "Write a comment..."}
                  className="h-9 flex-1 rounded-lg border border-[rgb(var(--border))] px-3 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                />
                <Button size="sm" onClick={() => addComment(activePost.id, { parentId: activeReplyByPost[activePost.id] ?? null })}>
                  {activeReplyByPost[activePost.id] ? "Reply" : "Post"}
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
                <p className="text-sm text-[rgb(var(--muted))]">Adjust your post title, body text, and optional image.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editImagePreview.startsWith("blob:")) URL.revokeObjectURL(editImagePreview);
                  setEditingPost(null);
                  setEditTitle("");
                  setEditImagePreview("");
                  setEditImageDataUrl("");
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
              <div className="space-y-2">
                <label className="block text-sm text-[rgb(var(--muted))]">Post image (optional)</label>
                <input type="file" accept="image/*" onChange={(event) => void onPickEditImage(event)} />
                {editImagePreview ? (
                  <img src={editImagePreview} alt="Edited post image preview" className="max-h-64 w-full rounded-xl object-cover" />
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (editImagePreview.startsWith("blob:")) URL.revokeObjectURL(editImagePreview);
                    setEditingPost(null);
                    setEditTitle("");
                    setEditContent("");
                    setEditImagePreview("");
                    setEditImageDataUrl("");
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
