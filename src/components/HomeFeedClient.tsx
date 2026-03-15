"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SidebarMenu from "@/components/SidebarMenu";
import CreatePost from "@/components/CreatePost";
import { ChannelContentType } from "@/lib/channel-data";
import { supabase } from "@/lib/supabase";

type FeedPost = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string | Date | null;
  author_id: string | null;
  channel_id: string | null;
  media_url: string | null;
  post_type: string | null;
  channels: { name: string } | null;
  _count: { comments: number };
};

type SidebarChannel = {
  id: string;
  name: string;
  iconUrl: string | null;
  contentType: ChannelContentType;
};

type BasicProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

type UserProfile = {
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
};

type HomeFeedClientProps = {
  posts: FeedPost[];
  channels: SidebarChannel[];
  profile: UserProfile | null;
  activityProfiles: BasicProfile[];
  authorProfiles: BasicProfile[];
};

type ThemePack = "minimal" | "nature" | "high-contrast";
type DashboardWidgetKey = "profile_card" | "goals" | "recent_activity";
type DashboardWidgets = Record<DashboardWidgetKey, boolean>;

type ComposerMeta = {
  flair?: string;
  nsfw?: boolean;
  mediaCount?: number;
};

type PostVote = -1 | 0 | 1;

type ThreadReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type ThreadComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  replies: ThreadReply[];
};

type CommentProfile = {
  username: string | null;
  display_name: string | null;
};

type RawCommentRow = {
  id: string;
  parent_id: string | null;
  content: string;
  created_at: string | null;
  profiles: CommentProfile | CommentProfile[] | null;
};

const defaultWidgets: DashboardWidgets = {
  profile_card: true,
  goals: true,
  recent_activity: true,
};

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function formatRelativeTime(dateValue: string | Date | null) {
  if (!dateValue) return "just now";

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  return `${Math.floor(diffMs / day)}d ago`;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


function countThreadComments(comments: ThreadComment[]) {
  return comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);
}

function parseComposerContent(content: string | null, fallbackTitle: string | null) {
  if (!content) {
    return {
      body: fallbackTitle ?? "No post content yet.",
      metadata: null as ComposerMeta | null,
    };
  }

  const marker = "---composer-meta---";
  if (!content.includes(marker)) {
    return {
      body: content,
      metadata: null as ComposerMeta | null,
    };
  }

  const [bodyPart, metaPart] = content.split(marker);
  const trimmedBody = bodyPart.trim();

  try {
    const metadata = JSON.parse(metaPart.trim()) as ComposerMeta;
    return {
      body: trimmedBody || fallbackTitle || "No post content yet.",
      metadata,
    };
  } catch {
    return {
      body: trimmedBody || fallbackTitle || "No post content yet.",
      metadata: null as ComposerMeta | null,
    };
  }
}

export default function HomeFeedClient({ posts, channels, profile, activityProfiles, authorProfiles }: HomeFeedClientProps) {
  const authorMap = useMemo(() => new Map(authorProfiles.map((entry) => [entry.id, entry])), [authorProfiles]);
  const topPostCommentCount = posts.reduce((max, post) => Math.max(max, post._count.comments), 0);
  const [viewerProfile, setViewerProfile] = useState<UserProfile | null>(profile);
  const [themePack, setThemePack] = useState<ThemePack>("nature");
  const [widgets, setWidgets] = useState<DashboardWidgets>(defaultWidgets);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [votesByPost, setVotesByPost] = useState<Record<string, PostVote>>({});
  const [upvotesByPost, setUpvotesByPost] = useState<Record<string, number>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, ThreadComment[]>>({});
  const [commentsLoadingByPost, setCommentsLoadingByPost] = useState<Record<string, boolean>>({});
  const [newCommentByPost, setNewCommentByPost] = useState<Record<string, string>>({});
  const [replyDraftByComment, setReplyDraftByComment] = useState<Record<string, string>>({});
  const [interactionError, setInteractionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardSettings() {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user?.id;

      if (!userId || !mounted) return;
      setCurrentUserId(userId);

      const { data } = await supabase
        .from("profile_settings")
        .select("home_theme_pack, dashboard_widgets, avatar_url, banner_url")
        .eq("user_id", userId)
        .maybeSingle<{ home_theme_pack: ThemePack | null; dashboard_widgets: DashboardWidgets | null; avatar_url: string | null; banner_url: string | null }>();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle<{ username: string; display_name: string | null; avatar_url: string | null }>();

      if (!mounted) return;

      if (profileData) {
        setViewerProfile({
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: data?.avatar_url ?? profileData.avatar_url,
          banner_url: data?.banner_url ?? null,
        });
      }

      if (!data) return;

      if (data.home_theme_pack) setThemePack(data.home_theme_pack);
      if (data.dashboard_widgets) setWidgets({ ...defaultWidgets, ...data.dashboard_widgets });
    }

    void loadDashboardSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const theme =
    themePack === "minimal"
      ? {
          page: "bg-[#090a0e] text-[#e8ebf8]",
          shell: "border-[#23252f]",
          panel: "border-[#23252f] bg-[#12141b]",
          subtleText: "text-[#9ea4bc]",
        }
      : themePack === "high-contrast"
        ? {
            page: "bg-black text-white",
            shell: "border-white/40",
            panel: "border-white/35 bg-[#0a0a0a]",
            subtleText: "text-white/80",
          }
        : {
            page: "text-text",
            shell: "border-accent/20",
            panel: "glass-card border-accent/20",
            subtleText: "text-muted",
          };

  function readProfile(profileValue: RawCommentRow["profiles"]): CommentProfile | null {
    if (Array.isArray(profileValue)) {
      return profileValue[0] ?? null;
    }

    return profileValue;
  }

  function buildCommentThread(rows: RawCommentRow[]) {
    const map = new Map<string, ThreadComment>();
    const roots: ThreadComment[] = [];

    rows.forEach((row) => {
      if (row.parent_id) return;
      const profile = readProfile(row.profiles);
      const entry: ThreadComment = {
        id: row.id,
        author: profile?.display_name ?? profile?.username ?? "Community member",
        body: row.content,
        createdAt: row.created_at ?? new Date().toISOString(),
        replies: [],
      };
      map.set(row.id, entry);
      roots.push(entry);
    });

    rows.forEach((row) => {
      if (!row.parent_id) return;
      const parent = map.get(row.parent_id);
      if (!parent) return;
      const profile = readProfile(row.profiles);
      parent.replies.push({
        id: row.id,
        author: profile?.display_name ?? profile?.username ?? "Community member",
        body: row.content,
        createdAt: row.created_at ?? new Date().toISOString(),
      });
    });

    return roots.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  const loadUpvoteCounts = useCallback(async () => {
    if (posts.length === 0) return;
    const postIds = posts.map((post) => post.id);
    const { data, error } = await supabase.from("post_votes").select("post_id").eq("vote", 1).in("post_id", postIds);

    if (error) {
      if (error.message.includes("relation") || error.message.includes("does not exist")) {
        setInteractionError("Run the Supabase migration for post votes/comments first.");
      }
      return;
    }

    const upvoteCountMap: Record<string, number> = {};
    postIds.forEach((id) => {
      upvoteCountMap[id] = 0;
    });

    (data ?? []).forEach((row) => {
      upvoteCountMap[row.post_id] = (upvoteCountMap[row.post_id] ?? 0) + 1;
    });

    setUpvotesByPost(upvoteCountMap);
  }, [posts]);

  const loadVotes = useCallback(async (userId: string) => {
    if (posts.length === 0) return;
    const postIds = posts.map((post) => post.id);
    const { data, error } = await supabase.from("post_votes").select("post_id, vote").eq("user_id", userId).in("post_id", postIds);

    if (error) {
      if (error.message.includes("relation") || error.message.includes("does not exist")) {
        setInteractionError("Run the Supabase migration for post votes/comments first.");
      }
      return;
    }

    const nextVotes: Record<string, PostVote> = {};
    (data ?? []).forEach((row) => {
      if (row.vote === 1 || row.vote === -1) nextVotes[row.post_id] = row.vote;
    });
    setVotesByPost(nextVotes);
  }, [posts]);

  async function loadPostComments(postId: string) {
    setCommentsLoadingByPost((current) => ({ ...current, [postId]: true }));
    const { data, error } = await supabase
      .from("comments")
      .select("id, parent_id, content, created_at, profiles(username, display_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message.includes("relation") || error.message.includes("does not exist")) {
        setInteractionError("The comments table is missing in this Supabase environment.");
      } else {
        setInteractionError(error.message);
      }
      setCommentsLoadingByPost((current) => ({ ...current, [postId]: false }));
      return;
    }

    const thread = buildCommentThread((data ?? []) as RawCommentRow[]);
    setCommentsByPost((current) => ({ ...current, [postId]: thread }));
    setCommentsLoadingByPost((current) => ({ ...current, [postId]: false }));
  }

  async function setPostVote(postId: string, nextVote: PostVote) {
    if (!currentUserId) {
      setInteractionError("Sign in to vote.");
      return;
    }

    const previousVote = votesByPost[postId] ?? 0;
    const resolvedVote = previousVote === nextVote ? 0 : nextVote;
    setVotesByPost((current) => ({ ...current, [postId]: resolvedVote }));
    setUpvotesByPost((current) => ({
      ...current,
      [postId]: Math.max(0, (current[postId] ?? 0) - (previousVote === 1 ? 1 : 0) + (resolvedVote === 1 ? 1 : 0)),
    }));

    if (resolvedVote === 0) {
      const { error } = await supabase.from("post_votes").delete().eq("post_id", postId).eq("user_id", currentUserId);
      if (error) setInteractionError(error.message);
      return;
    }

    const { error } = await supabase.from("post_votes").upsert({ post_id: postId, user_id: currentUserId, vote: resolvedVote }, { onConflict: "post_id,user_id" });
    if (error) setInteractionError(error.message);
  }

  async function addComment(postId: string) {
    if (!currentUserId) {
      setInteractionError("Sign in to comment.");
      return;
    }

    const draft = newCommentByPost[postId]?.trim();
    if (!draft) return;

    const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: currentUserId, content: draft, parent_id: null });
    if (error) {
      setInteractionError(error.message);
      return;
    }

    setNewCommentByPost((current) => ({ ...current, [postId]: "" }));
    await loadPostComments(postId);
  }

  async function addReply(postId: string, commentId: string) {
    if (!currentUserId) {
      setInteractionError("Sign in to reply.");
      return;
    }

    const replyKey = `${postId}:${commentId}`;
    const draft = replyDraftByComment[replyKey]?.trim();
    if (!draft) return;

    const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: currentUserId, parent_id: commentId, content: draft });
    if (error) {
      setInteractionError(error.message);
      return;
    }

    setReplyDraftByComment((current) => ({ ...current, [replyKey]: "" }));
    await loadPostComments(postId);
  }



  useEffect(() => {
    queueMicrotask(() => {
      void loadUpvoteCounts();
    });
  }, [loadUpvoteCounts]);

  useEffect(() => {
    if (!currentUserId) return;
    queueMicrotask(() => {
      void loadVotes(currentUserId);
    });
  }, [currentUserId, loadVotes]);

  function openPost(post: FeedPost) {
    setSelectedPost(post);
    void loadPostComments(post.id);
  }


  return (
    <main className={`h-screen overflow-hidden p-3 sm:p-6 ${theme.page}`}>
      <div className={`mx-auto grid h-full w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[250px_1fr_340px] ${theme.shell}`}>
        <div className={`border-b p-3 lg:border-b-0 lg:border-r lg:p-4 ${theme.shell}`}>
          <SidebarMenu channels={channels} onCreatePost={() => setIsComposerOpen(true)} />
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden p-3.5 sm:p-5.5">
          <div className="mb-4 grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto]">
            <div className={`rounded-[14px] border px-3.5 py-3.25 text-sm ${theme.panel} ${theme.subtleText}`}>🔎 Search channels, creators, and tags...</div>
          </div>

          <section className="min-h-0 flex-1">
              <section className="grid h-full grid-cols-1 gap-3 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {posts.map((post) => {
                  const author = post.author_id ? authorMap.get(post.author_id) : null;
                  const authorName = author?.display_name ?? author?.username ?? "Community member";
                  const authorHandle = author?.username ?? "bareunity";
                  const isTopPost = post._count.comments === topPostCommentCount && topPostCommentCount > 0;
                  const parsedPost = parseComposerContent(post.content, post.title);
                  const flair = parsedPost.metadata?.flair?.trim();
                  const postVote = votesByPost[post.id] ?? 0;
                  const upvoteCount = upvotesByPost[post.id] ?? 0;
                  const loadedComments = commentsByPost[post.id];
                  const totalCommentCount = loadedComments ? Math.max(post._count.comments, countThreadComments(loadedComments)) : post._count.comments;

                  return (
                    <article key={post.id} className={`rounded-[18px] border p-4 transition hover:border-[#5365a5] ${theme.panel}`}>

                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-[#8d76ff] to-[#2dd4bf] text-xs font-semibold text-white">
                            {initialsFromName(authorName)}
                          </div>
                          <div>
                            <strong className="block text-base">{authorName}</strong>
                            <span className={`text-xs ${theme.subtleText}`}>
                              @{authorHandle} · {formatRelativeTime(post.created_at)} · #{post.channels?.name?.toLowerCase().replace(/\s+/g, "-") ?? "general"}
                            </span>
                          </div>
                        </div>
                        <div className="h-fit rounded-full border border-[rgba(45,212,191,0.4)] bg-[rgba(45,212,191,0.08)] px-2 py-1.25 text-[11px] font-medium text-[#2dd4bf]">
                          {isTopPost ? "High engagement" : "Recent"}
                        </div>
                      </div>

                      {post.title ? <h3 className="mb-1 text-[15px] font-semibold text-[#f4f7ff]">{post.title}</h3> : null}
                      <p className="mb-3 line-clamp-3 whitespace-pre-line text-[14px] leading-relaxed text-[#dce2ff]">{parsedPost.body}</p>

                      {flair ? <div className="mb-3 inline-flex rounded-full border border-[#6f6bff]/35 bg-[#6f6bff]/12 px-2.5 py-1 text-[11px] font-medium text-[#d7d3ff]">#{flair}</div> : null}

                      {post.media_url ? (
                        <div className="mb-3 overflow-hidden rounded-[14px] border border-[#2b3150] bg-[#0a1020] p-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={post.media_url} alt={post.title ?? "Post media"} className="max-h-168 w-full rounded-[10px] object-contain" />
                        </div>

                      ) : (
                        <div className="mb-2.5 h-32.5 rounded-[14px] border border-[#2b3150] bg-[linear-gradient(125deg,rgba(124,92,255,0.4),rgba(45,212,191,0.2)),repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_6px,transparent_6px_12px)]" />
                      )}

                      <div className={`flex flex-wrap items-center gap-4 text-xs ${theme.subtleText}`}>
                        <button
                          type="button"
                          onClick={() => {
                            openPost(post);
                          }}
                          className="rounded-full border border-[#384271] px-2.5 py-1 hover:bg-[#1d2238]"
                        >
                          💬 {totalCommentCount} comments
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPostVote(post.id, 1);
                            }}
                            className={`rounded-full border px-2.5 py-1 ${postVote === 1 ? "border-[#2dd4bf] bg-[#2dd4bf]/15 text-[#8bf1de]" : "border-[#384271]"}`}
                          >
                            {postVote === 1 ? "♥" : "♡"} Upvote · {upvoteCount}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPostVote(post.id, -1);
                            }}
                            className={`rounded-full border px-2.5 py-1 ${postVote === -1 ? "border-[#f472b6] bg-[#f472b6]/12 text-[#f8a8d0]" : "border-[#384271]"}`}
                          >
                            {postVote === -1 ? "♥" : "♡"} Downvote
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          suppressHydrationWarning
                          value={newCommentByPost[post.id] ?? ""}
                          onChange={(event) => setNewCommentByPost((current) => ({ ...current, [post.id]: event.target.value }))}
                          onFocus={() => {
                            if (!commentsByPost[post.id]) {
                              void loadPostComments(post.id);
                            }
                          }}
                          placeholder="Write a comment from your feed"
                          className="w-full rounded-lg border border-[#384271] bg-[#0f162b] px-3 py-2 text-xs text-[#dbe3ff] outline-none"
                        />
                        <button type="button" onClick={() => addComment(post.id)} className="rounded-lg border border-[#384271] px-3 py-2 text-xs text-[#dbe3ff] hover:bg-[#1d2238]">
                          Comment
                        </button>
                      </div>
                    </article>
                  );
                })}

                {posts.length === 0 ? (
                  <article className={`rounded-[18px] border p-3.5 text-sm ${theme.panel} ${theme.subtleText}`}>
                    No posts yet. Create the first update from your community.
                  </article>
                ) : null}
              </section>
            </section>

          {selectedPost ? (
            <div className="fixed inset-0 z-60" role="dialog" aria-modal="true" aria-label="Post detail">
              <button
                type="button"
                aria-label="Close post detail"
                onClick={() => setSelectedPost(null)}
                className="absolute inset-0 bg-[#04060c]/75 backdrop-blur-sm"
              />

              <div className="relative mx-auto flex h-full w-full max-w-4xl items-center p-3 sm:p-6">
                <article className={`max-h-full w-full overflow-y-auto rounded-[18px] border p-4 sm:p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${theme.panel}`}>
                  {(() => {
                    const author = selectedPost.author_id ? authorMap.get(selectedPost.author_id) : null;
                    const authorName = author?.display_name ?? author?.username ?? "Community member";
                    const authorHandle = author?.username ?? "bareunity";
                    const parsedPost = parseComposerContent(selectedPost.content, selectedPost.title);
                    const flair = parsedPost.metadata?.flair?.trim();
                    const postVote = votesByPost[selectedPost.id] ?? 0;
                    const upvoteCount = upvotesByPost[selectedPost.id] ?? 0;
                    const threadComments = commentsByPost[selectedPost.id] ?? [];
                    const totalCommentCount = threadComments.length > 0 ? countThreadComments(threadComments) : selectedPost._count.comments;

                    return (
                      <>
                        <div className="mb-2.5 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-[#8d76ff] to-[#2dd4bf] text-xs font-semibold text-white">
                              {initialsFromName(authorName)}
                            </div>
                            <div>
                              <strong className="block text-base">{authorName}</strong>
                              <span className={`text-xs ${theme.subtleText}`}>
                                @{authorHandle} · {formatRelativeTime(selectedPost.created_at)} · #{selectedPost.channels?.name?.toLowerCase().replace(/\s+/g, "-") ?? "general"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPost(null)}
                            className="rounded-full border border-[#384271] px-2.5 py-1 text-[11px] text-[#dbe3ff] hover:bg-[#1d2238]"
                          >
                            Close
                          </button>
                        </div>

                        {selectedPost.title ? <h3 className="mb-1 text-[15px] font-semibold text-[#f4f7ff]">{selectedPost.title}</h3> : null}
                        <p className="mb-3 whitespace-pre-line text-[14px] leading-relaxed text-[#dce2ff]">{parsedPost.body}</p>

                        {flair ? <div className="mb-3 inline-flex rounded-full border border-[#6f6bff]/35 bg-[#6f6bff]/12 px-2.5 py-1 text-[11px] font-medium text-[#d7d3ff]">#{flair}</div> : null}

                        {selectedPost.media_url ? (
                          <div className="mb-3 overflow-hidden rounded-[14px] border border-[#2b3150] bg-[#0a1020] p-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={selectedPost.media_url} alt={selectedPost.title ?? "Post media"} className="max-h-[70vh] w-full rounded-[10px] object-contain" />
                          </div>
                        ) : null}

                        <div className="mt-4 space-y-3 rounded-[14px] border border-[#2b3150] bg-[#0d1322] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button type="button" className="rounded-full border border-[#384271] px-2.5 py-1 text-xs text-[#dbe3ff]">
                              💬 {totalCommentCount} comments
                            </button>
                            <div className="flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => setPostVote(selectedPost.id, 1)}
                                className={`rounded-full border px-2.5 py-1 ${postVote === 1 ? "border-[#2dd4bf] bg-[#2dd4bf]/15 text-[#8bf1de]" : "border-[#384271] text-[#dbe3ff]"}`}
                              >
                                {postVote === 1 ? "♥" : "♡"} Upvote · {upvoteCount}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPostVote(selectedPost.id, -1)}
                                className={`rounded-full border px-2.5 py-1 ${postVote === -1 ? "border-[#f472b6] bg-[#f472b6]/12 text-[#f8a8d0]" : "border-[#384271] text-[#dbe3ff]"}`}
                              >
                                {postVote === -1 ? "♥" : "♡"} Downvote
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <input
                              value={newCommentByPost[selectedPost.id] ?? ""}
                              onChange={(event) => setNewCommentByPost((current) => ({ ...current, [selectedPost.id]: event.target.value }))}
                              placeholder="Add a comment"
                              className="w-full rounded-lg border border-[#384271] bg-[#131b31] px-3 py-2 text-sm text-[#e4e9ff] outline-none focus:border-[#6f7fc7]"
                            />
                            <button type="button" onClick={() => addComment(selectedPost.id)} className="rounded-lg border border-[#384271] px-3 py-2 text-xs text-[#dbe3ff] hover:bg-[#1d2238]">
                              Comment
                            </button>
                          </div>

                          {interactionError ? <p className="text-xs text-rose-300">{interactionError}</p> : null}
                          {commentsLoadingByPost[selectedPost.id] ? <p className="text-xs text-[#9ca9d4]">Loading comments...</p> : null}

                          {threadComments.length > 0 ? (
                            <div className="space-y-2">
                              {threadComments.map((comment) => {
                                const replyKey = `${selectedPost.id}:${comment.id}`;
                                return (
                                  <article key={comment.id} className="rounded-xl border border-[#2b3150] bg-[#131b31] p-2.5">
                                    <p className="text-[10px] uppercase tracking-wide text-[#8ea2e5]">{comment.author}</p>
                                    <p className="text-sm text-[#e4e9ff]">{comment.body}</p>

                                    <div className="mt-2 flex gap-2">
                                      <input
                                        value={replyDraftByComment[replyKey] ?? ""}
                                        onChange={(event) => setReplyDraftByComment((current) => ({ ...current, [replyKey]: event.target.value }))}
                                        placeholder="Reply to this comment"
                                        className="w-full rounded-lg border border-[#384271] bg-[#0f162b] px-2.5 py-1.5 text-xs text-[#dbe3ff] outline-none"
                                      />
                                      <button type="button" onClick={() => addReply(selectedPost.id, comment.id)} className="rounded-lg border border-[#384271] px-2.5 py-1.5 text-xs text-[#dbe3ff] hover:bg-[#1d2238]">
                                        Reply
                                      </button>
                                    </div>

                                    {comment.replies.length > 0 ? (
                                      <div className="mt-2 space-y-1.5 border-l border-[#384271] pl-3">
                                        {comment.replies.map((reply) => (
                                          <div key={reply.id}>
                                            <p className="text-[10px] uppercase tracking-wide text-[#8ea2e5]">{reply.author}</p>
                                            <p className="text-xs text-[#dbe3ff]">{reply.body}</p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </article>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-[#9ca9d4]">No local comments yet. Be the first to comment.</p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </article>
              </div>
            </div>
          ) : null}

          {isComposerOpen ? (
            <div className="fixed inset-0 z-60" role="dialog" aria-modal="true" aria-label="Create post flyout">
              <button
                type="button"
                aria-label="Close create post"
                onClick={() => setIsComposerOpen(false)}
                className="absolute inset-0 bg-[#04060c]/75 backdrop-blur-sm"
              />
              <div className="relative h-full w-full overflow-y-auto bg-[#070e18] p-3 sm:p-5">
                <CreatePost onCancel={() => setIsComposerOpen(false)} onPublished={() => setIsComposerOpen(false)} />
              </div>
            </div>
          ) : null}
        </section>

        <aside className={`border-t bg-[rgba(9,11,19,0.66)] p-[22px_18px] lg:border-l lg:border-t-0 ${theme.shell}`}>
          {widgets.profile_card ? (
          <div className={`mb-4.5 rounded-[14px] border px-3 pb-3 pt-4.5 text-center ${theme.panel}`}>
            {viewerProfile?.banner_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewerProfile.banner_url} alt="Profile banner" className="-mx-3 -mt-4.5 mb-3 h-14 w-[calc(100%+24px)] rounded-t-xl object-cover opacity-80" />
            ) : null}
            <div className="mx-auto mb-2.5 flex h-16.5 w-16.5 items-center justify-center overflow-hidden rounded-full border-2 border-[rgba(124,92,255,0.45)] bg-linear-to-br from-[#7c5cff] to-[#2dd4bf]">
              {viewerProfile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewerProfile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-white">{initialsFromName(viewerProfile?.display_name ?? viewerProfile?.username ?? "Welcome")}</span>
              )}
            </div>
            <strong>{viewerProfile?.display_name ?? viewerProfile?.username ?? "Welcome"}</strong>
            <div className={`mt-0.5 text-xs ${theme.subtleText}`}>@{viewerProfile?.username ?? "creator"} · Product Designer</div>
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{numberFormatter.format(viewerProfile ? posts.length * 140 : 0)}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Followers</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{authorProfiles.length}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Following</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{posts.length}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Posts</span>
              </div>
            </div>
            <Link href="/profile" className="mt-3 inline-flex rounded-full border border-[#384271] px-3 py-2 text-xs font-semibold text-[#dbe3ff] hover:bg-[#1d2238]">
              View full profile
            </Link>
          </div>
          ) : null}

          {widgets.goals ? <><div className={`mb-3 text-[13px] tracking-[0.2px] ${theme.subtleText}`}>Goals this week</div>
          <div className={`mb-4.5 rounded-[14px] border p-3 text-xs ${theme.panel}`}>
            <div className="flex items-center justify-between border-b border-dashed border-[#2a3151] py-2">
              <span>Ship feed prototype</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">In review</span>
            </div>
            <div className="flex items-center justify-between border-b border-dashed border-[#2a3151] py-2">
              <span>Publish channel update</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">{Math.min(posts.length, 3)}/3 done</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Reply to comments</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">{posts.reduce((sum, post) => sum + post._count.comments, 0)} pending</span>
            </div>
          </div></> : null}

          {widgets.recent_activity ? <><div className={`mb-3 text-[13px] tracking-[0.2px] ${theme.subtleText}`}>Recent activity</div>
          <div className={`rounded-[14px] border p-3 ${theme.panel}`}>
            {activityProfiles.map((entry, index) => (
              <div key={entry.id} className={`grid grid-cols-[auto_1fr] gap-2.5 ${index < activityProfiles.length - 1 ? "mb-2.5" : ""}`}>
                <div className="mt-1.5 h-2 w-2 rounded-full bg-[#2dd4bf] shadow-[0_0_0_4px_rgba(45,212,191,0.14)]" />
                <div>
                  <p className="m-0 text-xs leading-[1.35] text-[#dbe3ff]">{entry.display_name ?? entry.username} joined and started exploring channels.</p>
                  <span className={`text-[11px] ${theme.subtleText}`}>{index + 1}h ago</span>
                </div>
              </div>
            ))}
          </div></> : null}
        </aside>
      </div>
    </main>
  );
}