"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Circle,
  Ellipsis,
  Flag,
  Heart,
  ImageIcon,
  MapPin,
  MessageCircle,
  Pencil,
  TrendingUp,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { UsernameActionPopup } from "@/components/social/username-action-popup";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildUserScopedCacheKey,
  hasFreshCachedValue,
  readCachedValue,
  writeCachedValue,
} from "@/lib/client-cache";
import type {
  HomeFeedComment,
  HomeFeedPayload,
  HomeFeedPost,
  HomeFeedStory,
} from "@/lib/homefeed";
import { sanitizeImageUpload } from "@/lib/image";
import { HOME_FEED_REALTIME_TABLES, subscribeToTables } from "@/lib/realtime";
import { promptAndSubmitReport, type ReportTargetType } from "@/lib/reporting";
import { takePrefetchedRouteData } from "@/lib/prefetched-route-data";
import { supabase } from "@/lib/supabase";
import {
  getVisitorTrialStatus,
  type VisitorTrialStatus,
} from "@/lib/visitor-trial";
import styles from "./page.module.css";

const defaultFeed: HomeFeedPayload = {
  stories: [],
  posts: [],
  viewerId: null,
};

function normalizeFeedPayload(
  payload: HomeFeedPayload | null | undefined,
): HomeFeedPayload {
  const source = payload ?? defaultFeed;
  return {
    ...source,
    stories: Array.isArray(source.stories) ? source.stories : [],
    posts: Array.isArray(source.posts)
      ? source.posts.map((post) => ({
          ...post,
          comments: Array.isArray(post.comments) ? post.comments : [],
        }))
      : [],
    viewerId: source.viewerId ?? null,
  };
}
const HOME_FEED_CACHE_MAX_AGE_MS = 1000 * 60 * 15;
const STORY_VIEW_MS = 7000;
const STORY_HOLD_MIN_MS = 180;
type ViewerActionSettings = {
  onboarding_completed: boolean | null;
  user_role: string | null;
};

type LikePreviewUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

type HomeFeedOverview = {
  members: number | null;
  online: number | null;
  locations: number | null;
  events: number | null;
};

type HomeFeedLocation = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  terrain: string | null;
  safetyLevel: string | null;
  description: string | null;
};

type HomeFeedEvent = {
  id: string;
  title: string;
  location: string | null;
  startTime: string | null;
};

type HomeFeedTopic = {
  id: string;
  title: string;
  postCount: number;
};

const defaultOverview: HomeFeedOverview = {
  members: null,
  online: null,
  locations: null,
  events: null,
};

function formatStat(value: number | null) {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-US").format(value)
    : "—";
}

function formatEventDateParts(startTime: string | null) {
  if (!startTime)
    return { month: "TBA", day: "--", time: "Date to be announced" };

  const date = new Date(startTime);
  if (Number.isNaN(date.getTime()))
    return { month: "TBA", day: "--", time: "Date to be announced" };

  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.toLocaleDateString("en-US", { day: "2-digit" }),
    time: date.toLocaleDateString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function getDailyLocationIndex(locationCount: number) {
  if (locationCount <= 0) return 0;
  const todayUtc = Math.floor(Date.now() / 86_400_000);
  return todayUtc % locationCount;
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const [homeFeedCacheKey] = useState(() =>
    buildUserScopedCacheKey("home-feed"),
  );
  const [cachedFeed] = useState<HomeFeedPayload | null>(() =>
    readCachedValue<HomeFeedPayload>(homeFeedCacheKey, {
      maxAgeMs: HOME_FEED_CACHE_MAX_AGE_MS,
      allowExpired: true,
    }),
  );
  const [prefetchedFeed] = useState<HomeFeedPayload | null>(() =>
    takePrefetchedRouteData<HomeFeedPayload>("homefeed"),
  );
  const [hasFreshCacheOnMount] = useState(() =>
    hasFreshCachedValue(homeFeedCacheKey, HOME_FEED_CACHE_MAX_AGE_MS),
  );
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"post" | "story" | null>(
    null,
  );
  const [activeFeedTab, setActiveFeedTab] = useState<"following" | "forYou">(
    "following",
  );
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postImagePreview, setPostImagePreview] = useState<string>("");
  const [postImageDataUrl, setPostImageDataUrl] = useState<string>("");
  const galleryImageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraImageInputRef = useRef<HTMLInputElement | null>(null);
  const [feed, setFeed] = useState<HomeFeedPayload>(() =>
    normalizeFeedPayload(prefetchedFeed ?? cachedFeed ?? defaultFeed),
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [activeReplyByPost, setActiveReplyByPost] = useState<
    Record<string, string | null>
  >({});
  const [expandedCommentThreadsByPost, setExpandedCommentThreadsByPost] =
    useState<Record<string, Record<string, boolean>>>({});
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isLoadingFeed, setLoadingFeed] = useState(
    () => !prefetchedFeed && !cachedFeed,
  );
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<HomeFeedPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [editImageDataUrl, setEditImageDataUrl] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{
    postId: string;
    commentId?: string;
  } | null>(null);
  const [openLikesPostId, setOpenLikesPostId] = useState<string | null>(null);
  const [likesByPost, setLikesByPost] = useState<
    Record<string, LikePreviewUser[]>
  >({});
  const [likesLoadingPostId, setLikesLoadingPostId] = useState<string | null>(
    null,
  );
  const [expandedCaptionsByPost, setExpandedCaptionsByPost] = useState<
    Record<string, boolean>
  >({});
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(
    null,
  );
  const [storyTimerCycle, setStoryTimerCycle] = useState(0);
  const [storyTimeRemainingMs, setStoryTimeRemainingMs] =
    useState(STORY_VIEW_MS);
  const [isStoryTimerPaused, setStoryTimerPaused] = useState(false);
  const [, setSeenStoryIds] = useState<Set<string>>(() => new Set());
  const [reportStatus, setReportStatus] = useState("");
  const [visitorTrialStatus, setVisitorTrialStatus] =
    useState<VisitorTrialStatus | null>(null);
  const [overview, setOverview] = useState<HomeFeedOverview>(defaultOverview);
  const [featuredLocation, setFeaturedLocation] =
    useState<HomeFeedLocation | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeFeedEvent[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<HomeFeedTopic[]>([]);
  const [isViewerActionLocked, setViewerActionLocked] = useState(false);
  const storyTimerStartedAtRef = useRef<number | null>(null);
  const storyHoldStartedAtRef = useRef<number | null>(null);
  const suppressStoryTapRef = useRef(false);
  const hasOpenedLinkedPostRef = useRef(false);

  const loadHomeFeedSidebar = useCallback(async () => {
    const [
      membersResult,
      locationsResult,
      eventsResult,
      postsResult,
      commentsResult,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("naturist_map_spots")
        .select("id,name,country,region,terrain,safety_level,description", {
          count: "exact",
        })
        .order("name", { ascending: true })
        .limit(500),
      supabase
        .from("events")
        .select("id,title,location,start_time", { count: "exact" })
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(3),
      supabase
        .from("posts")
        .select("id,title,content,created_at")
        .is("expires_at", null)
        .order("created_at", { ascending: false })
        .limit(24),
      supabase.from("comments").select("post_id"),
    ]);

    setOverview((current) => ({
      members: membersResult.count ?? null,
      online: current.online,
      locations: locationsResult.count ?? null,
      events: eventsResult.count ?? null,
    }));

    const locations = (locationsResult.data ?? []) as Array<{
      id: string;
      name: string;
      country: string | null;
      region: string | null;
      terrain: string | null;
      safety_level: string | null;
      description: string | null;
    }>;
    const dailyLocation =
      locations[getDailyLocationIndex(locations.length)] ?? null;
    setFeaturedLocation(
      dailyLocation
        ? {
            id: dailyLocation.id,
            name: dailyLocation.name,
            country: dailyLocation.country,
            region: dailyLocation.region,
            terrain: dailyLocation.terrain,
            safetyLevel: dailyLocation.safety_level,
            description: dailyLocation.description,
          }
        : null,
    );

    setUpcomingEvents(
      (
        (eventsResult.data ?? []) as Array<{
          id: string;
          title: string;
          location: string | null;
          start_time: string | null;
        }>
      ).map((event) => ({
        id: event.id,
        title: event.title,
        location: event.location,
        startTime: event.start_time,
      })),
    );

    const commentCounts = new Map<string, number>();
    ((commentsResult.data ?? []) as Array<{ post_id: string | null }>).forEach(
      (comment) => {
        if (!comment.post_id) return;
        commentCounts.set(
          comment.post_id,
          (commentCounts.get(comment.post_id) ?? 0) + 1,
        );
      },
    );

    const topics = (
      (postsResult.data ?? []) as Array<{
        id: string;
        title: string | null;
        content: string | null;
      }>
    ).map((post) => {
      const firstLine = (post.title || post.content || "Community discussion")
        .split("\n")[0]
        .trim();
      return {
        id: post.id,
        title:
          firstLine.length > 58 ? `${firstLine.slice(0, 55)}...` : firstLine,
        postCount: Math.max(1, commentCounts.get(post.id) ?? 0),
      };
    });

    setTrendingTopics(
      topics.sort((a, b) => b.postCount - a.postCount).slice(0, 2),
    );
  }, []);

  const canPublish =
    composerKind === "story"
      ? Boolean(postImageDataUrl)
      : postTitle.trim().length > 0 &&
        (postContent.trim().length > 0 || Boolean(postImageDataUrl));

  const postPreview = postContent;

  const getAuthHeaders = async (options?: {
    includeJsonContentType?: boolean;
  }) => {
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

        const data = normalizeFeedPayload(
          (await response.json()) as HomeFeedPayload,
        );
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
      const shouldRefresh =
        (!cachedFeed && !prefetchedFeed) || !hasFreshCacheOnMount;
      if (shouldRefresh) {
        void loadFeed();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cachedFeed, hasFreshCacheOnMount, loadFeed, prefetchedFeed]);

  useEffect(() => {
    void loadHomeFeedSidebar();

    return subscribeToTables({
      channelName: "homefeed-sidebar-live-updates",
      client: supabase,
      tables: ["profiles", "naturist_map_spots", "events", "posts", "comments"],
      onChange: () => void loadHomeFeedSidebar(),
      debounceMs: 600,
    });
  }, [loadHomeFeedSidebar]);

  useEffect(() => {
    const presenceName =
      feed.viewerId ?? `guest-${Math.random().toString(36).slice(2)}`;
    const onlineChannel = supabase.channel("homefeed-sidebar-online", {
      config: { presence: { key: presenceName } },
    });

    onlineChannel.on("presence", { event: "sync" }, () => {
      const presenceState = onlineChannel.presenceState();
      setOverview((current) => ({
        ...current,
        online: Object.keys(presenceState).length,
      }));
    });

    void onlineChannel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await onlineChannel.track({ online_at: new Date().toISOString() });
    });

    return () => {
      void onlineChannel.untrack();
      void supabase.removeChannel(onlineChannel);
    };
  }, [feed.viewerId]);

  useEffect(() => {
    if (hasOpenedLinkedPostRef.current) return;
    const linkedPostId = searchParams.get("postId");
    if (!linkedPostId) return;
    if (!feed.posts.some((post) => post.id === linkedPostId)) return;
    setActivePostId(linkedPostId);
    hasOpenedLinkedPostRef.current = true;
  }, [feed.posts, searchParams]);

  useEffect(() => {
    return () => {
      if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    };
  }, [postImagePreview]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user || !isMounted) return;

      setVisitorTrialStatus(getVisitorTrialStatus(user.user_metadata));

      const { data: settings } = await supabase
        .from("profile_settings")
        .select("onboarding_completed,user_role")
        .eq("user_id", user.id)
        .maybeSingle<ViewerActionSettings>();

      if (!isMounted) return;
      setViewerActionLocked(
        !settings ||
          settings.user_role === "view_only" ||
          settings.onboarding_completed !== true,
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

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
      body: JSON.stringify({
        title: postTitle,
        content: postContent,
        mediaUrl: postImageDataUrl,
        kind: composerKind,
      }),
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

    const sanitized = await sanitizeImageUpload(
      selectedFile,
      composerKind === "story" ? 1440 : 1920,
    );
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
    const likeDelta = liked
      ? targetPost.likedByViewer
        ? 0
        : 1
      : targetPost.likedByViewer
        ? -1
        : 0;

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

  const addComment = async (
    postId: string,
    options?: { parentId?: string | null },
  ) => {
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
    if (parentId)
      setActiveReplyByPost((current) => ({ ...current, [postId]: null }));
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
    setLikesByPost((current) => ({
      ...current,
      [postId]: payload.likes ?? [],
    }));
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
    if (editImagePreview.startsWith("blob:"))
      URL.revokeObjectURL(editImagePreview);
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
      body: JSON.stringify({
        title: editTitle,
        content: editContent,
        mediaUrl: editImageDataUrl,
      }),
    });

    if (!response.ok) return;
    if (editImagePreview.startsWith("blob:"))
      URL.revokeObjectURL(editImagePreview);
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

    if (!deleteTarget.commentId && activePostId === deleteTarget.postId)
      setActivePostId(null);
    setDeleteTarget(null);
    await loadFeed();
  };

  const rootCommentsForPost = useCallback((post: HomeFeedPost) => {
    const knownIds = new Set(post.comments.map((comment) => comment.id));
    return post.comments.filter(
      (comment) => !comment.parentId || !knownIds.has(comment.parentId),
    );
  }, []);
  const getChildComments = useCallback(
    (comments: HomeFeedComment[], parentId: string) =>
      comments.filter((comment) => comment.parentId === parentId),
    [],
  );

  const activePost = activePostId
    ? (feed.posts.find((post) => post.id === activePostId) ?? null)
    : null;
  const posts = feed.posts;
  const stories: HomeFeedStory[] = feed.stories;
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
          new Date(firstStory.createdAt).getTime() -
          new Date(secondStory.createdAt).getTime(),
      );
      grouped.set(authorId, orderedStories);
    });
    return grouped;
  }, [stories]);
  const activeStorySeries = useMemo(
    () =>
      activeStoryAuthorId
        ? (groupedStories.get(activeStoryAuthorId) ?? [])
        : [],
    [activeStoryAuthorId, groupedStories],
  );
  const activeStory =
    activeStoryIndex !== null
      ? (activeStorySeries[activeStoryIndex] ?? null)
      : null;
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
    if (
      holdStartedAt !== null &&
      Date.now() - holdStartedAt >= STORY_HOLD_MIN_MS
    ) {
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

  const reportItem = async (
    targetType: ReportTargetType,
    targetId: string | null | undefined,
    label: string,
  ) => {
    const result = await promptAndSubmitReport({ targetType, targetId, label });
    if (!result.message) return;
    setReportStatus(result.message);
    window.setTimeout(() => setReportStatus(""), 4500);
  };

  const showActionLockedMessage = () => {
    const visitorPrefix = visitorTrialStatus?.isActive
      ? `Your Visitor Pass has ${visitorTrialStatus.daysRemaining} day${visitorTrialStatus.daysRemaining === 1 ? "" : "s"} left for browsing and previewing.`
      : "Visitor and pending accounts can browse BareUnity.";
    setReportStatus(
      `${visitorPrefix} Verify with ID to post, comment, comment, check in, or submit places.`,
    );
    window.setTimeout(() => setReportStatus(""), 6500);
  };

  const openComposer = () => {
    if (isViewerActionLocked) {
      showActionLockedMessage();
      return;
    }

    setComposerOpen(true);
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
        <div className={styles.homeFeedShell}>
          <div className={styles.homeFeedMain}>
            <header className={styles.feedHeader}>
              <div className={styles.feedHeaderTitleBlock}>
                <h1>Home Feed</h1>
                <p>What&apos;s happening in the BareUnity community</p>
              </div>
              <div className={styles.feedHeaderActions}>
                <div
                  className={styles.feedTabSwitch}
                  aria-label="Home feed filter"
                >
                  <button
                    type="button"
                    onClick={() => setActiveFeedTab("following")}
                    className={
                      activeFeedTab === "following" ? styles.feedTabActive : ""
                    }
                  >
                    Following
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFeedTab("forYou")}
                    className={
                      activeFeedTab === "forYou" ? styles.feedTabActive : ""
                    }
                  >
                    For you
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={openComposer}
                  className={styles.feedCreateButton}
                >
                  <Pencil className="h-4 w-4" />
                  {isViewerActionLocked ? "Verify to create" : "Create Post"}
                </Button>
              </div>
            </header>

            {visitorTrialStatus?.isVisitorTrial ? (
              <div className={styles.visitorTrialBanner}>
                <div>
                  <p className={styles.visitorTrialEyebrow}>
                    7-day Visitor Pass
                  </p>
                  <h2>
                    {visitorTrialStatus.isActive
                      ? `${visitorTrialStatus.daysRemaining} day${visitorTrialStatus.daysRemaining === 1 ? "" : "s"} of browsing left`
                      : "Visitor Pass ended"}
                  </h2>
                  <p>
                    Preview feeds, profiles, places, and community value.
                    Member-impacting actions stay locked until ID verification
                    protects the community.
                  </p>
                </div>
                <Link
                  href="/settings#verification"
                  className={styles.visitorTrialLink}
                >
                  Verification settings
                </Link>
              </div>
            ) : null}

            {reportStatus ? (
              <p className={styles.reportStatus}>{reportStatus}</p>
            ) : null}

            <div className={styles.feedStack}>
              <section
                className={styles.quickComposer}
                aria-label="Create a community post"
              >
                <div className={styles.quickComposerRow}>
                  <Avatar
                    alt="Your profile"
                    fallback="J"
                    className={styles.quickComposerAvatar}
                  />
                  <button
                    type="button"
                    onClick={openComposer}
                    className={styles.quickComposerInput}
                  >
                    Share a bare moment, ask a question, or start a
                    discussion...
                  </button>
                </div>
                <div className={styles.quickComposerActions}>
                  <button type="button" onClick={openComposer}>
                    <ImageIcon className="h-4 w-4" />
                    Photo
                  </button>
                  <button type="button" onClick={openComposer}>
                    <MapPin className="h-4 w-4" />
                    Location
                  </button>
                  <button type="button" onClick={openComposer}>
                    <BarChart3 className="h-4 w-4" />
                    Poll
                  </button>
                  <Button
                    size="sm"
                    onClick={openComposer}
                    className={styles.quickPostButton}
                  >
                    Post
                  </Button>
                </div>
              </section>

              <nav className={styles.feedPills} aria-label="Post categories">
                {[
                  "All Posts",
                  "Naturist Moments",
                  "Discussions",
                  "Locations",
                  "Experiences",
                ].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={index === 0 ? styles.feedPillActive : ""}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className={styles.feedList}>
                {isLoadingFeed && posts.length === 0 ? (
                  <Card className="border-0 bg-[rgb(var(--card))]">
                    <CardContent className="p-4 text-sm text-[rgb(var(--muted))]">
                      Loading your feed…
                    </CardContent>
                  </Card>
                ) : null}

                {posts.map((post: HomeFeedPost) => {
                  const caption = post.text.trim();
                  const isCaptionExpanded = Boolean(
                    expandedCaptionsByPost[post.id],
                  );
                  const shouldClampCaption =
                    caption.length > 160 || caption.includes("\n");

                  return (
                    <Card
                      key={post.id}
                      className="border-0 bg-[rgb(var(--card))]"
                    >
                      <CardContent className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar
                              alt={post.author}
                              fallback={post.fallback}
                              className="h-11 w-11"
                            />
                            <div>
                              <UsernameActionPopup
                                userId={post.authorId}
                                displayName={post.author}
                                triggerClassName="text-sm font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"
                              />
                              <p className="text-xs text-[rgb(var(--muted))]">
                                {post.posted}
                              </p>
                            </div>
                          </div>
                          {feed.viewerId && post.authorId === feed.viewerId ? (
                            <div className="relative">
                              <button
                                type="button"
                                aria-label="Open post actions"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--bg-soft))]"
                                onClick={() =>
                                  setOpenPostMenuId((current) =>
                                    current === post.id ? null : post.id,
                                  )
                                }
                              >
                                <Ellipsis className="h-4 w-4" />
                              </button>
                              {openPostMenuId === post.id ? (
                                <div className="absolute right-0 top-9 z-20 min-w-32 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-1 shadow-lg">
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
                            <Image
                              src={post.mediaUrl}
                              alt={`${post.author}'s post`}
                              width={1200}
                              height={1200}
                              sizes="(min-width: 1280px) 60vw, 100vw"
                              className="h-130 w-full rounded-2xl bg-[rgb(var(--bg-soft))] object-contain"
                            />
                          ) : null}
                        </div>
                        {caption ? (
                          <div className="mb-3">
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
                              <span className="mr-1">
                                <UsernameActionPopup
                                  userId={post.authorId}
                                  displayName={post.author}
                                  triggerClassName="font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"
                                />
                              </span>
                              {caption}
                            </p>
                            {shouldClampCaption ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCaptionsByPost((current) => ({
                                    ...current,
                                    [post.id]: !current[post.id],
                                  }))
                                }
                                className="mt-1 inline-block text-left text-xs font-medium text-[rgb(var(--muted))]"
                                aria-expanded={isCaptionExpanded}
                                aria-label={
                                  isCaptionExpanded
                                    ? "Collapse caption"
                                    : "Expand caption"
                                }
                              >
                                {isCaptionExpanded ? "Show less" : "Show more"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className={
                              post.likedByViewer
                                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                : "text-[rgb(var(--text-strong))]"
                            }
                            onClick={() => toggleLike(post.id)}
                          >
                            <Heart
                              className={`mr-1 h-4 w-4 ${post.likedByViewer ? "fill-current text-red-500" : ""}`}
                            />
                            Like ({post.likes})
                          </Button>
                          {feed.viewerId && post.authorId === feed.viewerId ? (
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void toggleLikesDropdown(post.id)
                                }
                              >
                                Liked by
                                <ChevronDown className="ml-1 h-4 w-4" />
                              </Button>
                              {openLikesPostId === post.id ? (
                                <div className="absolute right-0 top-10 z-20 w-60 max-w-[calc(100vw-2.5rem)] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-2 shadow-lg sm:left-0 sm:right-auto sm:max-w-none">
                                  {likesLoadingPostId === post.id ? (
                                    <p className="px-2 py-1 text-xs text-[rgb(var(--muted))]">
                                      Loading likes...
                                    </p>
                                  ) : likesByPost[post.id]?.length ? (
                                    <div className="max-h-48 space-y-1 overflow-y-auto">
                                      {likesByPost[post.id].map((user) => (
                                        <div
                                          key={user.userId}
                                          className="flex items-center gap-2 rounded-md px-2 py-1"
                                        >
                                          <Avatar
                                            src={user.avatarUrl ?? undefined}
                                            alt={user.name}
                                            fallback={user.name
                                              .slice(0, 2)
                                              .toUpperCase()}
                                            className="h-7 w-7"
                                          />
                                          <span className="text-xs font-medium text-[rgb(var(--text-strong))]">
                                            {user.name}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="px-2 py-1 text-xs text-[rgb(var(--muted))]">
                                      No likes yet.
                                    </p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setActivePostId(post.id)}
                          >
                            <Badge
                              variant="outline"
                              className="px-3 py-1 text-xs hover:bg-[rgb(var(--bg-soft))]"
                            >
                              <MessageCircle className="mr-1 h-3.5 w-3.5" />
                              {post.comments.length} comments
                            </Badge>
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void reportItem("post", post.id, "post")
                            }
                          >
                            <Flag className="mr-1 h-4 w-4" />
                            Report
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          <aside
            className={styles.homeFeedAside}
            aria-label="Community sidebar"
          >
            <section className={styles.overviewCard}>
              <div className={styles.asideCardHeader}>
                <h2>Community Overview</h2>
                <Link href="/members">View all</Link>
              </div>
              <div className={styles.overviewGrid}>
                {[
                  {
                    value: formatStat(overview.members),
                    label: "Members",
                    icon: Users,
                  },
                  {
                    value: formatStat(overview.online),
                    label: "Online",
                    icon: Circle,
                  },
                  {
                    value: formatStat(overview.locations),
                    label: "Locations",
                    icon: MapPin,
                  },
                  {
                    value: formatStat(overview.events),
                    label: "Events",
                    icon: Calendar,
                  },
                ].map((item) => (
                  <div key={item.label} className={styles.overviewStat}>
                    <div>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                    <item.icon className="h-5 w-5" />
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.asideCard}>
              <div className={styles.asideCardHeader}>
                <h2>Featured Location</h2>
                <Link href="/explore">View all</Link>
              </div>
              <div className={styles.featuredLocationImage}>
                <button type="button" aria-label="Previous featured location">
                  ‹
                </button>
                <button type="button" aria-label="Next featured location">
                  ›
                </button>
              </div>
              <div className={styles.locationMeta}>
                <div>
                  <h3>
                    {featuredLocation?.name ?? "No featured location yet"}
                  </h3>
                  <p>
                    {[featuredLocation?.region, featuredLocation?.country]
                      .filter(Boolean)
                      .join(", ") ||
                      featuredLocation?.terrain ||
                      "Explore locations"}
                  </p>
                  <span>
                    {featuredLocation?.safetyLevel ?? "Rotates daily"}
                  </span>
                </div>
                <Link href="/explore" className={styles.locationButton}>
                  View Location
                </Link>
              </div>
            </section>

            <section className={styles.asideCard}>
              <div className={styles.asideCardHeader}>
                <h2>Upcoming Events</h2>
                <Link href="/bookings/activities">View all</Link>
              </div>
              <div className={styles.eventList}>
                {upcomingEvents.length ? (
                  upcomingEvents.map((event) => {
                    const dateParts = formatEventDateParts(event.startTime);
                    return (
                      <div key={event.id} className={styles.eventItem}>
                        <div className={styles.eventDate}>
                          <span>{dateParts.month}</span>
                          <strong>{dateParts.day}</strong>
                        </div>
                        <div>
                          <h3>{event.title}</h3>
                          <p>{dateParts.time}</p>
                          <p>{event.location ?? "Community event"}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className={styles.asideEmptyState}>
                    No upcoming events yet.
                  </p>
                )}
              </div>
            </section>

            <section className={styles.asideCard}>
              <div className={styles.asideCardHeader}>
                <h2>Trending Topics</h2>
                <Link href="/discussion">View all</Link>
              </div>
              <div className={styles.topicList}>
                {trendingTopics.length ? (
                  trendingTopics.map((topic) => (
                    <Link
                      href={`/discussion?postId=${topic.id}`}
                      key={topic.id}
                      className={styles.topicItem}
                    >
                      <TrendingUp className="h-5 w-5" />
                      <span>
                        <strong>{topic.title}</strong>
                        <small>
                          {topic.postCount}{" "}
                          {topic.postCount === 1 ? "reply" : "replies"}
                        </small>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className={styles.asideEmptyState}>
                    No trending posts yet.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>

      {isComposerOpen ? (
        <div
          className={`${styles.composerOverlay} fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${styles.composerDialog} w-full max-w-2xl rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
                  {composerKind === "story"
                    ? "Create story"
                    : "Create new post"}
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
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 text-left hover:bg-[rgb(var(--card))]"
                  onClick={() => setComposerKind("post")}
                >
                  <p className="font-semibold text-[rgb(var(--text-strong))]">
                    New post
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                    Share text, markdown formatting, and an image.
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4 text-left hover:bg-[rgb(var(--card))]"
                  onClick={() => setComposerKind("story")}
                >
                  <p className="font-semibold text-[rgb(var(--text-strong))]">
                    New story
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                    Photo story that expires after 24 hours.
                  </p>
                </button>
              </div>
            ) : null}

            {composerKind ? (
              <div className={`${styles.composerBody} space-y-3`}>
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

                <div>
                  <textarea
                    value={postContent}
                    onChange={(event) => setPostContent(event.target.value)}
                    className="min-h-40 w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                    placeholder={
                      composerKind === "story"
                        ? "Add an optional story note..."
                        : "Write your post content here..."
                    }
                  />
                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Press Enter for a new line. Use the Publish button when you
                    are ready to post.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-[rgb(var(--muted))]">
                    {composerKind === "story"
                      ? "Story image (required)"
                      : "Post image (optional)"}
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
                        Pick an existing photo or open your camera to take a new
                        story image.
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
                    <img
                      src={postImagePreview}
                      alt="Selected upload preview"
                      className="max-h-48 w-full rounded-xl object-cover sm:max-h-56"
                    />
                  ) : null}
                </div>

                <div
                  className={`${styles.composerPreview} rounded-lg bg-[rgb(var(--bg-soft))] p-3`}
                >
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
                    Preview
                  </p>
                  {postPreview.trim() ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[rgb(var(--text))] [overflow-wrap:anywhere]">
                      {postPreview}
                    </p>
                  ) : (
                    <p className="text-sm text-[rgb(var(--muted))]">
                      Start typing to preview formatted content.
                    </p>
                  )}
                </div>

                <div
                  className={`${styles.composerActions} flex justify-end gap-2`}
                >
                  <Button variant="outline" onClick={closeComposer}>
                    Cancel
                  </Button>
                  <Button onClick={publishPost} disabled={!canPublish}>
                    {composerKind === "story"
                      ? "Publish story"
                      : "Publish post"}
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
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--card)/0.25)]">
              <div
                key={storyTimerCycle}
                className={`${styles.storyProgress} ${isStoryTimerPaused ? styles.storyProgressPaused : ""}`}
              />
            </div>
            <div className="mb-3 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Avatar
                  alt={activeStory.name}
                  fallback={activeStory.fallback}
                  className="h-10 w-10 border border-white/70"
                />
                <div>
                  <p className="text-sm font-semibold">{activeStory.name}</p>
                  <p className="text-xs text-white/80">{activeStory.posted}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void reportItem("story", activeStory.postId, "story");
                  }}
                  aria-label="Report story"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-white/50 px-3 text-xs font-semibold text-white hover:bg-[rgb(var(--card)/0.15)]"
                >
                  <Flag className="h-4 w-4" />
                  Report
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeStory();
                  }}
                  aria-label="Close story"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/50 text-white hover:bg-[rgb(var(--card)/0.15)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/40">
              {activeStory.imageUrl ? (
                <img
                  src={activeStory.imageUrl}
                  alt={`${activeStory.name} story`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div
                  className={`h-full w-full bg-gradient-to-br ${activeStory.tone}`}
                />
              )}
              <p className="absolute bottom-4 left-4 right-4 text-sm font-medium text-white drop-shadow">
                Tap right for next · tap left for previous · press and hold to
                pause
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activePost ? (
        <div
          className="fixed inset-0 z-50 bg-[rgb(var(--card))]"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border-x border-[rgb(var(--border))] bg-[rgb(var(--card))]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3">
              <div>
                <p className="text-base font-semibold text-[rgb(var(--text-strong))]">
                  Comments
                </p>
                <p className="text-xs text-[rgb(var(--muted))]">
                  {activePost.comments.length} total
                </p>
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
                <UsernameActionPopup
                  userId={activePost.authorId}
                  displayName={activePost.author}
                  triggerClassName="text-sm font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"
                />
                {activePost.mediaUrl ? (
                  <img
                    src={activePost.mediaUrl}
                    alt={`${activePost.author}'s post`}
                    className="mt-3 max-h-[28rem] w-full rounded-xl bg-[rgb(var(--card))] object-contain"
                  />
                ) : null}
                {activePost.text ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-[rgb(var(--text))]">
                    {activePost.text}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
                  onClick={() => void reportItem("post", activePost.id, "post")}
                >
                  <Flag className="h-3.5 w-3.5" />
                  Report post
                </button>
              </div>
              <div className="space-y-2 pb-4">
                {rootCommentsForPost(activePost).map((comment) => {
                  const renderComment = (
                    node: HomeFeedComment,
                    depth: number,
                    visited: Set<string>,
                  ) => {
                    if (visited.has(node.id)) return null;
                    const nextVisited = new Set(visited);
                    nextVisited.add(node.id);
                    const children = getChildComments(
                      activePost.comments,
                      node.id,
                    );
                    const areRepliesExpanded = Boolean(
                      expandedCommentThreadsByPost[activePost.id]?.[node.id],
                    );
                    const visibleChildren = areRepliesExpanded ? children : [];
                    const commentAuthorName =
                      node.authorName || "Community member";
                    const commentFallback = node.authorFallback || "BU";

                    return (
                      <div key={node.id} className="space-y-2">
                        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <Avatar
                                src={node.authorAvatarUrl ?? undefined}
                                alt={commentAuthorName}
                                fallback={commentFallback}
                                className="h-8 w-8"
                              />
                              <div>
                                <UsernameActionPopup
                                  userId={node.authorId}
                                  displayName={commentAuthorName}
                                  triggerClassName="text-xs font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"
                                />
                                <p className="whitespace-pre-line text-sm text-[rgb(var(--text))] break-words [overflow-wrap:anywhere]">
                                  {node.content}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {feed.viewerId &&
                              node.authorId === feed.viewerId ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDeleteModal(activePost.id, node.id)
                                  }
                                  className="text-xs font-medium text-rose-600 hover:underline"
                                >
                                  Delete
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  void reportItem("comment", node.id, "comment")
                                }
                                className="text-xs font-medium text-rose-600 hover:underline"
                              >
                                Report
                              </button>
                            </div>
                          </div>
                          <div className="mt-1 pl-10">
                            <button
                              type="button"
                              className="text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text-strong))]"
                              onClick={() =>
                                setActiveReplyByPost((current) => ({
                                  ...current,
                                  [activePost.id]:
                                    current[activePost.id] === node.id
                                      ? null
                                      : node.id,
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
                            {areRepliesExpanded
                              ? "Hide replies"
                              : `${children.length} more repl${children.length === 1 ? "y" : "ies"}`}
                          </button>
                        ) : null}
                        {visibleChildren.length ? (
                          <div
                            className={`space-y-2 border-l border-[rgb(var(--border))] pl-3 ${depth === 0 ? "ml-10" : "ml-6"}`}
                          >
                            {visibleChildren.map((child) =>
                              renderComment(child, depth + 1, nextVisited),
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  };

                  return renderComment(comment, 0, new Set());
                })}
              </div>
            </div>
            <div className="sticky bottom-0 z-10 space-y-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3">
              {activeReplyByPost[activePost.id] ? (
                <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] px-3 py-2">
                  <p className="text-xs text-[rgb(var(--muted))]">
                    Replying to{" "}
                    <span className="font-semibold text-[rgb(var(--text-strong))]">
                      {activePost.comments.find(
                        (comment) =>
                          comment.id === activeReplyByPost[activePost.id],
                      )?.authorName || "Community member"}
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
                <textarea
                  rows={2}
                  value={commentDrafts[activePost.id] ?? ""}
                  onChange={(event) =>
                    setCommentDrafts((current) => ({
                      ...current,
                      [activePost.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    activeReplyByPost[activePost.id]
                      ? "Write a reply..."
                      : "Write a comment..."
                  }
                  className="min-h-9 flex-1 resize-y rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                  aria-label={
                    activeReplyByPost[activePost.id]
                      ? "Write a reply"
                      : "Write a comment"
                  }
                />
                <Button
                  size="sm"
                  onClick={() =>
                    addComment(activePost.id, {
                      parentId: activeReplyByPost[activePost.id] ?? null,
                    })
                  }
                >
                  {activeReplyByPost[activePost.id] ? "Reply" : "Post"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingPost ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
                  Edit post
                </h2>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Adjust your post title, body text, and optional image.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editImagePreview.startsWith("blob:"))
                    URL.revokeObjectURL(editImagePreview);
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
              <div>
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  className="min-h-40 w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                  placeholder="Write your post content here..."
                />
                <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                  Press Enter for a new line. Use the Save button when you are
                  done.
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm text-[rgb(var(--muted))]">
                  Post image (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void onPickEditImage(event)}
                />
                {editImagePreview ? (
                  <img
                    src={editImagePreview}
                    alt="Edited post image preview"
                    className="max-h-64 w-full rounded-xl object-cover"
                  />
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (editImagePreview.startsWith("blob:"))
                      URL.revokeObjectURL(editImagePreview);
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
              Delete {deleteTarget.commentId ? "comment" : "post"}?
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted))]">
              {deleteTarget.commentId
                ? "Are you sure you want to delete this comment?"
                : "Are you sure you want to delete this post? This action cannot be undone."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
