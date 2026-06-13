"use client";

import { createRoot } from "react-dom/client";
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
  Building2,
  Calendar,
  Circle,
  Ellipsis,
  Flag,
  Flame,
  Heart,
  Hotel,
  MapPin,
  MessageCircle,
  Pencil,
  TentTree,
  TrendingUp,
  Trash2,
  Trees,
  Umbrella,
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
import { Card, CardContent } from "@/components/ui/card";
import {
  buildUserScopedCacheKey,
  hasFreshCachedValue,
  readCachedValue,
  writeCachedValue,
} from "@/lib/client-cache";
import {
  getInitials,
  pickPostTone,
  pickStoryTone,
  relativeTime,
  type HomeFeedComment,
  type HomeFeedPayload,
  type HomeFeedPost,
  type HomeFeedStory,
} from "@/lib/homefeed";
import { sanitizeImageUpload } from "@/lib/image";
import { resolveMediaUrl } from "@/lib/media-url";
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
  latitude: number | null;
  longitude: number | null;
  privacy: string | null;
};

type HomeFeedMapInstance = {
  remove: () => void;
  addControl: (control: unknown, position?: string) => void;
  flyTo?: (config: { center: [number, number]; zoom?: number }) => void;
};

type HomeFeedMarkerInstance = {
  remove: () => void;
  setLngLat: (lngLat: [number, number]) => HomeFeedMarkerInstance;
  addTo: (map: unknown) => unknown;
};

type HomeFeedMapLibreGlobal = {
  Map: new (config: Record<string, unknown>) => HomeFeedMapInstance;
  NavigationControl: new () => unknown;
  Marker: new (config: {
    element: HTMLElement;
    anchor?: string;
  }) => HomeFeedMarkerInstance;
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

type LiveFeedStatus = "connecting" | "live" | "reconnecting";

function getLiveFeedStatusLabel(status: LiveFeedStatus) {
  if (status === "live") return "Live updates on";
  if (status === "reconnecting") return "Reconnecting live feed";
  return "Connecting live feed";
}

type HomeFeedProfileRelation = {
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

type HomeFeedCommentRow = {
  id: string;
  content: string;
  author_id: string | null;
  parent_id: string | null;
  created_at?: string | null;
  profiles: HomeFeedProfileRelation | HomeFeedProfileRelation[] | null;
};

type HomeFeedVoteRow = {
  user_id: string | null;
  vote: number | null;
};

type HomeFeedPostRow = {
  id: string;
  author_id: string | null;
  title: string | null;
  content: string | null;
  media_url: string | null;
  post_type: string | null;
  created_at: string | null;
  expires_at?: string | null;
  profiles: HomeFeedProfileRelation | HomeFeedProfileRelation[] | null;
  comments?: HomeFeedCommentRow[] | null;
  post_votes?: HomeFeedVoteRow[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function homeFeedName(profile: HomeFeedProfileRelation | null) {
  return (
    profile?.display_name?.trim() ||
    profile?.username ||
    "Community member"
  );
}

function mapClientFeedPost(
  post: HomeFeedPostRow,
  index: number,
  viewerId: string | null,
): HomeFeedPost {
  const authorProfile = firstRelation(post.profiles);
  const author = homeFeedName(authorProfile);
  const votes = Array.isArray(post.post_votes) ? post.post_votes : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];

  return {
    id: post.id,
    author,
    fallback: getInitials(author),
    posted: relativeTime(post.created_at),
    text:
      [post.title?.trim(), post.content?.trim()].filter(Boolean).join("\n") ||
      "Shared an update",
    mediaUrl: resolveMediaUrl(post.media_url),
    postType: post.post_type === "image" ? "image" : "text",
    likes: votes.filter((vote) => (vote.vote ?? 0) > 0).length,
    comments: comments
      .slice()
      .sort(
        (firstComment, secondComment) =>
          new Date(firstComment.created_at ?? 0).getTime() -
          new Date(secondComment.created_at ?? 0).getTime(),
      )
      .map((comment) => {
        const commentProfile = firstRelation(comment.profiles);
        const commentAuthorName = homeFeedName(commentProfile);
        return {
          id: comment.id,
          content: comment.content,
          authorId: comment.author_id ?? null,
          authorName: commentAuthorName,
          authorFallback: getInitials(commentAuthorName),
          authorAvatarUrl: commentProfile?.avatar_url ?? null,
          parentId: comment.parent_id ?? null,
        };
      }),
    likedByViewer: viewerId
      ? votes.some((vote) => vote.user_id === viewerId && (vote.vote ?? 0) > 0)
      : false,
    tone: pickPostTone(index),
    authorId: post.author_id ?? null,
  };
}

async function loadHomeFeedViaSupabase(
  viewerId: string | null,
): Promise<HomeFeedPayload> {
  const now = new Date();

  const postsResult = await supabase
    .from("posts")
    .select(
      "id,author_id,title,content,media_url,post_type,created_at,profiles(username,display_name),comments(id,content,author_id,parent_id,created_at,profiles(username,display_name,avatar_url)),post_votes(user_id,vote)",
    )
    .neq("post_type", "story")
    .order("created_at", { ascending: false })
    .limit(20);

  if (postsResult.error) throw postsResult.error;

  const storiesResult = await supabase
    .from("posts")
    .select(
      "id,author_id,title,media_url,created_at,profiles(username,display_name)",
    )
    .eq("post_type", "story")
    .not("author_id", "is", null)
    .not("media_url", "is", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(20);

  if (storiesResult.error) throw storiesResult.error;

  const stories = ((storiesResult.data ?? []) as HomeFeedPostRow[]).map(
    (post, index) => {
      const profile = firstRelation(post.profiles);
      const name = homeFeedName(profile);
      const createdAt = post.created_at ?? now.toISOString();

      return {
        id: `${post.author_id!}-${post.id}`,
        postId: post.id,
        authorId: post.author_id!,
        name,
        fallback: getInitials(name),
        tone: pickStoryTone(index),
        imageUrl: resolveMediaUrl(post.media_url),
        posted: relativeTime(createdAt),
        createdAt: new Date(createdAt).toISOString(),
      };
    },
  );

  const posts = ((postsResult.data ?? []) as HomeFeedPostRow[]).map(
    (post, index) => mapClientFeedPost(post, index, viewerId),
  );

  return { stories, posts, viewerId };
}

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

function getHomeFeedMapLibre() {
  return (window as Window & { maplibregl?: HomeFeedMapLibreGlobal })
    .maplibregl;
}

function addMapLibreStylesheet(href: string) {
  if (document.querySelector(`link[data-maplibre-css="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.maplibreCss = href;
  document.head.appendChild(link);
}

function addMapLibreScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-maplibre-js="${src}"]`,
    ) as HTMLScriptElement | null;

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load MapLibre script.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.maplibreJs = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () =>
      reject(new Error("Failed to load MapLibre script.")),
    );
    document.body.appendChild(script);
  });
}

function terrainIconComponent(terrain: HomeFeedLocation["terrain"]) {
  const normalized = (terrain ?? "").toLowerCase();

  if (normalized.includes("beach")) return Umbrella;
  if (normalized.includes("forest")) return Trees;
  if (normalized.includes("resort")) return Hotel;
  if (normalized.includes("camp")) return TentTree;
  if (normalized.includes("hot spring")) return Flame;
  if (normalized.includes("urban") || normalized.includes("rooftop"))
    return Building2;
  return MapPin;
}

function buildFeaturedLocationMarkerElement(location: HomeFeedLocation) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.style.width = "44px";
  marker.style.height = "44px";
  marker.style.minWidth = "44px";
  marker.style.minHeight = "44px";
  marker.style.display = "grid";
  marker.style.placeItems = "center";
  marker.style.padding = "0";
  marker.style.border = "0";
  marker.style.borderRadius = "999px";
  marker.style.background = "transparent";
  marker.style.cursor = "pointer";
  marker.style.lineHeight = "1";
  marker.style.setProperty("-webkit-tap-highlight-color", "transparent");
  marker.setAttribute("aria-label", location.name);

  const isPublic = location.privacy === "Public";
  marker.style.color = isPublic
    ? "rgba(90, 51, 0, 0.92)"
    : "rgba(225, 255, 242, 0.96)";

  const markerBadge = document.createElement("span");
  markerBadge.style.width = "30px";
  markerBadge.style.height = "30px";
  markerBadge.style.display = "grid";
  markerBadge.style.placeItems = "center";
  markerBadge.style.borderRadius = "999px";
  markerBadge.style.border = "1px solid rgba(255, 255, 255, 0.72)";
  markerBadge.style.background = isPublic
    ? "linear-gradient(145deg, rgba(250, 205, 102, 0.98), rgba(236, 165, 66, 0.98))"
    : "linear-gradient(145deg, rgba(16, 146, 112, 0.98), rgba(13, 108, 92, 0.98))";
  markerBadge.style.boxShadow = "0 8px 18px rgba(0, 0, 0, 0.26)";
  markerBadge.style.backdropFilter = "blur(1.5px)";

  const icon = document.createElement("span");
  icon.style.width = "15px";
  icon.style.height = "15px";
  icon.style.display = "inline-grid";
  icon.style.placeItems = "center";
  icon.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,0.12))";

  const Icon = terrainIconComponent(location.terrain);
  createRoot(icon).render(<Icon size={15} strokeWidth={2.35} />);
  markerBadge.appendChild(icon);
  marker.appendChild(markerBadge);

  return marker;
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
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postImagePreview, setPostImagePreview] = useState<string>("");
  const [postImagePath, setPostImagePath] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPublishingPost, setIsPublishingPost] = useState(false);
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
  const [liveFeedStatus, setLiveFeedStatus] =
    useState<LiveFeedStatus>("connecting");
  const [lastFeedSyncAt, setLastFeedSyncAt] = useState<number | null>(() =>
    prefetchedFeed || cachedFeed ? Date.now() : null,
  );
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<HomeFeedPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [editImagePath, setEditImagePath] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{
    postId: string;
    commentId?: string;
  } | null>(null);
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
  const [featuredLocations, setFeaturedLocations] = useState<
    HomeFeedLocation[]
  >([]);
  const [featuredLocationIndex, setFeaturedLocationIndex] = useState(0);
  const [isFeaturedLocationMapReady, setFeaturedLocationMapReady] =
    useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeFeedEvent[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<HomeFeedTopic[]>([]);
  const [isViewerActionLocked, setViewerActionLocked] = useState(false);
  const featuredLocationMapRef = useRef<HomeFeedMapInstance | null>(null);
  const featuredLocationMapContainerRef = useRef<HTMLDivElement | null>(null);
  const featuredLocationMarkerRef = useRef<HomeFeedMarkerInstance | null>(null);
  const storyTimerStartedAtRef = useRef<number | null>(null);
  const storyHoldStartedAtRef = useRef<number | null>(null);
  const suppressStoryTapRef = useRef(false);
  const hasOpenedLinkedPostRef = useRef(false);
  const feedRefreshInFlightRef = useRef(false);
  const publishPostInFlightRef = useRef(false);
  const pendingFeedRefreshRef = useRef(false);
  const [pendingLikePostIds, setPendingLikePostIds] = useState<Set<string>>(
    () => new Set(),
  );

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
        .select(
          "id,name,country,region,terrain,safety_level,description,latitude,longitude,privacy",
          {
            count: "exact",
          },
        )
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
      latitude: number | string | null;
      longitude: number | string | null;
      privacy: string | null;
    }>;
    const mappedLocations = locations
      .map((location) => ({
        id: location.id,
        name: location.name,
        country: location.country,
        region: location.region,
        terrain: location.terrain,
        safetyLevel: location.safety_level,
        description: location.description,
        latitude: Number.isFinite(Number(location.latitude))
          ? Number(location.latitude)
          : null,
        longitude: Number.isFinite(Number(location.longitude))
          ? Number(location.longitude)
          : null,
        privacy: location.privacy,
      }))
      .filter(
        (location) => location.latitude !== null && location.longitude !== null,
      );
    setFeaturedLocations(mappedLocations);
    setFeaturedLocationIndex((current) => {
      if (!mappedLocations.length) return 0;
      if (current > 0 && current < mappedLocations.length) return current;
      return getDailyLocationIndex(mappedLocations.length);
    });

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
      ? Boolean(postImagePath)
      : postTitle.trim().length > 0 &&
        (postContent.trim().length > 0 || Boolean(postImagePath));

  const postPreview = postContent;
  const liveFeedStatusLabel = getLiveFeedStatusLabel(liveFeedStatus);

  const getAuthHeaders = async (options?: {
    includeJsonContentType?: boolean;
  }) => {
    const headers: HeadersInit = {};
    if (options?.includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    const viewerId = data.session?.user?.id ?? null;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return { headers, hasAuthToken: Boolean(accessToken), viewerId };
  };

  const loadFeed = useCallback(
    async (options?: {
      showSpinner?: boolean;
      attempt?: number;
      force?: boolean;
    }) => {
      if (feedRefreshInFlightRef.current) {
        pendingFeedRefreshRef.current = true;
        return;
      }

      feedRefreshInFlightRef.current = true;
      pendingFeedRefreshRef.current = false;
      if (options?.showSpinner) setLoadingFeed(true);
      let fallbackViewerId: string | null = null;
      try {
        const attempt = options?.attempt ?? 0;
        const { headers, hasAuthToken, viewerId } = await getAuthHeaders();
        fallbackViewerId = viewerId;

        if (!hasAuthToken && attempt < 6) {
          window.setTimeout(() => {
            void loadFeed({ ...options, attempt: attempt + 1 });
          }, 150);
          return;
        }

        const response = await fetch("/api/homefeed", {
          cache: "no-store",
          headers: hasAuthToken ? headers : {},
        });

        if (!response.ok) {
          throw new Error(`Home feed request failed (${response.status})`);
        }

        const data = normalizeFeedPayload(
          (await response.json()) as HomeFeedPayload,
        );
        writeCachedValue(homeFeedCacheKey, data);
        setFeed(data);
        setLastFeedSyncAt(Date.now());
      } catch {
        try {
          const fallbackData = normalizeFeedPayload(
            await loadHomeFeedViaSupabase(fallbackViewerId),
          );
          writeCachedValue(homeFeedCacheKey, fallbackData);
          setFeed(fallbackData);
          setLastFeedSyncAt(Date.now());
        } catch {
          // Keep showing cached data when available. If neither cache nor network works, page keeps current state.
        }
      } finally {
        feedRefreshInFlightRef.current = false;
        setLoadingFeed(false);
        if (pendingFeedRefreshRef.current) {
          pendingFeedRefreshRef.current = false;
          window.setTimeout(() => void loadFeed({ force: true }), 0);
        }
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
    setLiveFeedStatus("connecting");

    return subscribeToTables({
      channelName: "homefeed-live-updates",
      client: supabase,
      tables: HOME_FEED_REALTIME_TABLES,
      onChange: () => {
        setLiveFeedStatus("live");
        void loadFeed({ force: true });
      },
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          setLiveFeedStatus("live");
          return;
        }

        setLiveFeedStatus("reconnecting");
        void loadFeed({ force: true });
      },
      debounceMs: 150,
    });
  }, [loadFeed]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadFeed();
    };

    const pollTimer = window.setInterval(refreshIfVisible, 15_000);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadFeed]);

  const publishPost = async () => {
    if (!canPublish || !composerKind || publishPostInFlightRef.current) return;

    publishPostInFlightRef.current = true;
    setIsPublishingPost(true);

    try {
      const response = await fetch("/api/homefeed", {
        method: "POST",
        headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
        body: JSON.stringify({
          title: postTitle,
          content: postContent,
          mediaUrl: postImagePath,
          kind: composerKind,
        }),
      });

      if (!response.ok) return;

      setPostTitle("");
      setPostContent("");
      setPostImagePreview("");
      setPostImagePath("");
      setComposerKind(null);
      setComposerOpen(false);
      await loadFeed();
    } finally {
      publishPostInFlightRef.current = false;
      setIsPublishingPost(false);
    }
  };

  const onPickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setIsUploadingImage(true);

    try {
      const sanitized = await sanitizeImageUpload(
        selectedFile,
        composerKind === "story" ? 1440 : 1920,
      );
      if (postImagePreview) URL.revokeObjectURL(postImagePreview);
      const preview = URL.createObjectURL(sanitized);
      const uploadResponse = await fetch("/api/homefeed/upload-url", {
        method: "POST",
        headers: (
          await getAuthHeaders({
            includeJsonContentType: true,
          })
        ).headers,
        body: JSON.stringify({
          fileName: sanitized.name,
          contentType: sanitized.type,
          size: sanitized.size,
          kind: composerKind,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { bucketId, path, token } = await uploadResponse.json();

      const { error } = await supabase.storage
        .from(bucketId)
        .uploadToSignedUrl(path, token, sanitized, {
          contentType: sanitized.type,
        });

      if (error) {
        throw error;
      }

      setPostImagePreview(preview);
      setPostImagePath(path);
      setIsUploadingImage(false);
    } catch (error) {
      console.error("Image upload failed", error);
      setIsUploadingImage(false);
    }
  };

  const toggleLike = async (postId: string) => {
    if (isViewerActionLocked) {
      showActionLockedMessage();
      return;
    }

    const targetPost = feed.posts.find((post) => post.id === postId);
    if (!targetPost || pendingLikePostIds.has(postId)) return;

    const nextLiked = !targetPost.likedByViewer;
    const optimisticDelta = nextLiked ? 1 : -1;

    setPendingLikePostIds((current) => new Set(current).add(postId));
    setFeed((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByViewer: nextLiked,
              likes: Math.max(0, post.likes + optimisticDelta),
            }
          : post,
      ),
    }));

    try {
      const response = await fetch(`/api/homefeed/posts/${postId}/like`, {
        method: "POST",
        headers: (await getAuthHeaders()).headers,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "We could not update that like.");
      }

      const payload = (await response.json()) as {
        liked?: boolean;
        likes?: number;
      };
      const liked = Boolean(payload.liked);

      setFeed((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByViewer: liked,
                likes:
                  typeof payload.likes === "number"
                    ? Math.max(0, payload.likes)
                    : Math.max(
                        0,
                        post.likes +
                          (liked === post.likedByViewer
                            ? 0
                            : liked
                              ? 1
                              : -1),
                      ),
              }
            : post,
        ),
      }));
      void loadFeed({ force: true });
    } catch (error) {
      setFeed((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByViewer: targetPost.likedByViewer,
                likes: targetPost.likes,
              }
            : post,
        ),
      }));
      setReportStatus(
        error instanceof Error
          ? error.message
          : "We could not update that like.",
      );
      window.setTimeout(() => setReportStatus(""), 4500);
    } finally {
      setPendingLikePostIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
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

  const openEditPostModal = (post: HomeFeedPost) => {
    const [existingTitle, ...existingContentLines] = post.text.split("\n");
    setEditingPost(post);
    setEditTitle(existingTitle ?? "");
    setEditContent(existingContentLines.join("\n"));
    setEditImagePreview(post.mediaUrl ?? "");
    setEditImagePath("");
    setOpenPostMenuId(null);
  };

  const onPickEditImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const sanitized = await sanitizeImageUpload(selectedFile, 1920);
    if (editImagePreview.startsWith("blob:"))
      URL.revokeObjectURL(editImagePreview);
    const preview = URL.createObjectURL(sanitized);
    const uploadResponse = await fetch("/api/homefeed/upload-url", {
      method: "POST",
      headers: (
        await getAuthHeaders({
          includeJsonContentType: true,
        })
      ).headers,
      body: JSON.stringify({
        fileName: sanitized.name,
        contentType: sanitized.type,
        size: sanitized.size,
      }),
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to get upload URL");
    }

    const { bucketId, path, token } = await uploadResponse.json();

    const { error } = await supabase.storage
      .from(bucketId)
      .uploadToSignedUrl(path, token, sanitized, {
        contentType: sanitized.type,
      });

    if (error) {
      throw error;
    }

    setEditImagePreview(preview);
    setEditImagePath(path);
  };

  const editPost = async () => {
    if (!editingPost) return;

    const response = await fetch(`/api/homefeed/posts/${editingPost.id}`, {
      method: "PATCH",
      headers: (await getAuthHeaders({ includeJsonContentType: true })).headers,
      body: JSON.stringify({
        title: editTitle,
        content: editContent,
        mediaUrl: editImagePath,
      }),
    });

    if (!response.ok) return;
    if (editImagePreview.startsWith("blob:"))
      URL.revokeObjectURL(editImagePreview);
    setEditingPost(null);
    setEditTitle("");
    setEditContent("");
    setEditImagePreview("");
    setEditImagePath("");
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
  const featuredLocation =
    featuredLocations[featuredLocationIndex] ?? featuredLocations[0] ?? null;
  const canCycleFeaturedLocations = featuredLocations.length > 1;
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

  const showPreviousFeaturedLocation = () => {
    if (!featuredLocations.length) return;
    setFeaturedLocationIndex((current) =>
      current <= 0 ? featuredLocations.length - 1 : current - 1,
    );
  };

  const showNextFeaturedLocation = () => {
    if (!featuredLocations.length) return;
    setFeaturedLocationIndex((current) =>
      current >= featuredLocations.length - 1 ? 0 : current + 1,
    );
  };

  useEffect(() => {
    let mounted = true;

    async function initFeaturedLocationMap() {
      if (!featuredLocationMapContainerRef.current) return;
      if (featuredLocationMapRef.current) return;

      try {
        addMapLibreStylesheet(
          "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
        );
        await addMapLibreScript(
          "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
        );

        const maplibregl = getHomeFeedMapLibre();
        if (!mounted || !featuredLocationMapContainerRef.current || !maplibregl)
          return;

        const map = new maplibregl.Map({
          container: featuredLocationMapContainerRef.current,
          center: [0, 20],
          zoom: 1.4,
          interactive: false,
          attributionControl: false,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [
              {
                id: "osm",
                type: "raster",
                source: "osm",
              },
            ],
          },
        });

        featuredLocationMapRef.current = map;
        setFeaturedLocationMapReady(true);
      } catch (error) {
        console.error("Failed to load featured location map", error);
      }
    }

    void initFeaturedLocationMap();

    return () => {
      mounted = false;
      featuredLocationMarkerRef.current?.remove();
      featuredLocationMarkerRef.current = null;
      featuredLocationMapRef.current?.remove();
      featuredLocationMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = featuredLocationMapRef.current;
    const maplibregl = getHomeFeedMapLibre();
    if (!map || !maplibregl || !featuredLocation) return;
    if (
      featuredLocation.latitude === null ||
      featuredLocation.longitude === null
    )
      return;

    featuredLocationMarkerRef.current?.remove();
    const markerElement = buildFeaturedLocationMarkerElement(featuredLocation);
    featuredLocationMarkerRef.current = new maplibregl.Marker({
      element: markerElement,
      anchor: "center",
    }).setLngLat([featuredLocation.longitude, featuredLocation.latitude]);
    featuredLocationMarkerRef.current.addTo(map);
    map.flyTo?.({
      center: [featuredLocation.longitude, featuredLocation.latitude],
      zoom: 9,
    });
  }, [featuredLocation, isFeaturedLocationMapReady]);
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
      `${visitorPrefix} Verify with ID to post, like, comment, check in, or submit places.`,
    );
    window.setTimeout(() => setReportStatus(""), 6500);
  };

  const openComposer = () => {
    if (isViewerActionLocked) {
      showActionLockedMessage();
      return;
    }

    setComposerKind("post");
    setComposerOpen(true);
  };

  const closeComposer = () => {
    if (isUploadingImage || isPublishingPost) return;
    setComposerOpen(false);
    setComposerKind(null);
    setPostTitle("");
    setPostContent("");
    setPostImagePreview("");
    setPostImagePath("");
  };

  return (
    <main className={styles.main}>
      {!isComposerOpen ? <AppSidebar /> : null}

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
                  className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-xs font-semibold text-[rgb(var(--muted))]"
                  title={
                    lastFeedSyncAt
                      ? `Last synced ${new Date(lastFeedSyncAt).toLocaleTimeString()}`
                      : "Waiting for the first feed sync"
                  }
                  aria-live="polite"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      liveFeedStatus === "live"
                        ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]"
                        : liveFeedStatus === "reconnecting"
                          ? "bg-amber-400"
                          : "bg-sky-400"
                    }`}
                    aria-hidden="true"
                  />
                  {liveFeedStatusLabel}
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
              <div className={styles.feedList}>
                {isLoadingFeed && posts.length === 0 ? (
                  <Card className="border-0 bg-[rgb(var(--card))]">
                    <CardContent className="p-4 text-sm text-[rgb(var(--muted))]">
                      Loading your feed…
                    </CardContent>
                  </Card>
                ) : null}

                {!isLoadingFeed && posts.length === 0 ? (
                  <Card className="border-0 bg-[rgb(var(--card))]">
                    <CardContent className="p-5 text-sm text-[rgb(var(--muted))]">
                      No home feed posts are available yet. Try refreshing in a
                      moment, or create the first community post.
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
                            type="button"
                            size="sm"
                            variant="outline"
                            className={`w-36 gap-1 px-4 ${
                              post.likedByViewer
                                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                : "text-[rgb(var(--text-strong))]"
                            }`}
                            onClick={() => toggleLike(post.id)}
                            disabled={pendingLikePostIds.has(post.id)}
                            aria-pressed={post.likedByViewer}
                          >
                            <Heart
                              className={`h-4 w-4 ${post.likedByViewer ? "fill-current text-red-500" : ""}`}
                            />
                            Like ({post.likes})
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-36 gap-1 px-4 text-[rgb(var(--text-strong))]"
                            onClick={() => setActivePostId(post.id)}
                          >
                            <MessageCircle className="h-4 w-4" />
                            {post.comments.length} comments
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-36 gap-1 px-4 text-[rgb(var(--text-strong))]"
                            onClick={() =>
                              void reportItem("post", post.id, "post")
                            }
                          >
                            <Flag className="h-4 w-4" />
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
              <div className={styles.featuredLocationMapWrap}>
                <div
                  ref={featuredLocationMapContainerRef}
                  className={styles.featuredLocationMap}
                  aria-label={
                    featuredLocation
                      ? `${featuredLocation.name} map`
                      : "Featured location map"
                  }
                />
                <button
                  type="button"
                  aria-label="Previous featured location"
                  onClick={showPreviousFeaturedLocation}
                  disabled={!canCycleFeaturedLocations}
                  className={styles.featuredLocationPrevious}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next featured location"
                  onClick={showNextFeaturedLocation}
                  disabled={!canCycleFeaturedLocations}
                  className={styles.featuredLocationNext}
                >
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
          className={`${styles.composerOverlay} fixed inset-0 z-[160] flex bg-[rgb(var(--bg))]`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${styles.composerDialog} w-full bg-[rgb(var(--card))] p-5`}
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

                {isUploadingImage ? (
                  <p className="text-sm text-[rgb(var(--muted))]">
                    Uploading image...
                  </p>
                ) : null}
                <div
                  className={`${styles.composerActions} flex justify-end gap-2`}
                >
                  <Button variant="outline" onClick={closeComposer}>
                    Cancel
                  </Button>
                  <Button
                    onClick={publishPost}
                    disabled={!canPublish || isUploadingImage || isPublishingPost}
                  >
                    {isPublishingPost
                      ? "Publishing..."
                      : composerKind === "story"
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
                  setEditImagePath("");
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
                    setEditImagePath("");
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
