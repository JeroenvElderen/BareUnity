"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { UsernameActionPopup } from "@/components/social/username-action-popup";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadCachedThenRefresh } from "@/lib/client-cache";
import { PROFILE_REALTIME_TABLES, subscribeToTables } from "@/lib/realtime";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
};

type PostRow = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  created_at: string | null;
  post_type: string | null;
};

type ProfileData = {
  profile: ProfileRow | null;
  posts: PostRow[];
  friends: Array<{ id: string; username: string }>;
  interests: string[];
  stats: { posts: number; friends: number; comments: number };
};

const EMPTY_PROFILE_DATA: ProfileData = {
  profile: null,
  posts: [],
  friends: [],
  interests: [],
  stats: { posts: 0, friends: 0, comments: 0 },
};
const PROFILE_CACHE_MAX_AGE_MS = 1000 * 60 * 3;

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

function resolveMediaUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith("http")) return value;

  const normalizedPath = value.startsWith("posts/") ? value : `posts/${value}`;
  const { data } = supabase.storage.from("media").getPublicUrl(normalizedPath);
  return data.publicUrl;
}

function toReadableDate(value: string | null): string {
  if (!value) return "Recent";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recent";

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getProfileDataForUser(userId: string): Promise<ProfileData> {
  const [profileResult, postsResult, friendsResult, settingsResult, postsCountResult, friendsCountResult, commentsCountResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, location")
      .eq("id", userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("posts")
      .select("id, title, content, media_url, created_at, post_type")
      .eq("author_id", userId)
      .or("post_type.is.null,post_type.neq.story")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("friendships")
      .select("id, user_id, friend_user_id, friend_username")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("profile_settings")
      .select("interests")
      .eq("user_id", userId)
      .maybeSingle<{ interests: string[] | null }>(),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .or("post_type.is.null,post_type.neq.story"),
    supabase
      .from("friendships")
      .select("user_id, friend_user_id")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (postsResult.error) throw postsResult.error;
  if (friendsResult.error) throw friendsResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (postsCountResult.error) throw postsCountResult.error;
  if (friendsCountResult.error) throw friendsCountResult.error;
  if (commentsCountResult.error) throw commentsCountResult.error;

  const friendsById = new Map<string, { id: string; username: string }>();

  for (const friend of friendsResult.data ?? []) {
    const resolvedFriendId = friend.user_id === userId ? friend.friend_user_id : friend.user_id;
    if (!resolvedFriendId || friendsById.has(resolvedFriendId)) {
      continue;
    }

    friendsById.set(resolvedFriendId, {
      id: resolvedFriendId,
      username: friend.friend_username ?? "member",
    });
  }

  const uniqueFriendIds = new Set(
    (friendsCountResult.data ?? []).map((friendship) =>
      friendship.user_id === userId ? friendship.friend_user_id : friendship.user_id,
    ).filter((friendId): friendId is string => Boolean(friendId)),
  );

  return {
    profile: profileResult.data ?? null,
    posts: (postsResult.data ?? []) as PostRow[],
    friends: Array.from(friendsById.values()),
    interests: (settingsResult.data?.interests ?? []).slice(0, 8),
    stats: {
      posts: postsCountResult.count ?? 0,
      friends: uniqueFriendIds.size,
      comments: commentsCountResult.count ?? 0,
    },
  };
}

export default function ProfilePage() {
  const [profileData, setProfileData] = useState<ProfileData>(EMPTY_PROFILE_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionContext, setSessionContext] = useState<{ user: User | null; accessToken: string | null }>({
    user: null,
    accessToken: null,
  });
  const [activeTab, setActiveTab] = useState<"posts" | "about">("posts");

  const loadProfileForUser = useCallback(async (
    sessionUser: User | null,
    accessToken: string | null = null,
    options?: { background?: boolean },
  ) => {
    setSessionContext({ user: sessionUser, accessToken });

    if (!isSupabaseConfigured || !sessionUser) {
      setProfileData(EMPTY_PROFILE_DATA);
      setIsLoading(false);
      return;
    }

    if (!options?.background) {
      setIsLoading(true);
    }
    try {
      const data = await loadCachedThenRefresh<ProfileData>({
        key: `profile:${sessionUser.id}:v2`,
        maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
        onCachedData: (cached) => {
          setProfileData(cached);
          setIsLoading(false);
        },
        fetchFresh: () => getProfileDataForUser(sessionUser.id),
      });
      setProfileData(data);
    } finally {
      if (!options?.background) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      void loadProfileForUser(data.session?.user ?? null, data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfileForUser(session?.user ?? null, session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser]);

  useEffect(() => {
    if (!sessionContext.user || !sessionContext.accessToken) return;

    return subscribeToTables({
      channelName: `profile-live-updates:${sessionContext.user.id}`,
      client: supabase,
      tables: PROFILE_REALTIME_TABLES,
      onChange: () => {
        void loadProfileForUser(sessionContext.user, sessionContext.accessToken, { background: true });
      },
      debounceMs: 500,
    });
  }, [loadProfileForUser, sessionContext.accessToken, sessionContext.user]);
  
  const { profile, posts, friends, interests, stats } = profileData;

  const displayName =
    profile?.display_name?.trim() ||
    profile?.username ||
    "BareUnity Member";

  const bio =
    profile?.bio?.trim() ||
    "Nature-first connection, consent-forward gatherings, and calm community rituals.";

  const avatarFallback = getInitials(displayName);
  const usernameHandle = useMemo(() => `@${profile?.username ?? "member"}`, [profile?.username]);

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className="min-w-0 w-full flex-1 overflow-y-auto bg-[rgb(var(--bg-deep))/0.6] p-3 md:p-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Card className="overflow-hidden border-[rgb(var(--border))] bg-[rgb(var(--card))]">
            <div className="relative h-40 bg-[radial-gradient(circle_at_10%_10%,rgb(var(--accent-soft))_0%,transparent_48%),linear-gradient(120deg,rgb(var(--brand))_0%,rgb(var(--accent-soft))_100%)] md:h-52">
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <Badge className="bg-white/20 text-white">My profile</Badge>
                <UsernameActionPopup
                  variant="button"
                  userId={profile?.id ?? null}
                  username={profile?.username ?? null}
                  displayName="Actions"
                />
              </div>
            </div>

            <CardContent className="-mt-14 space-y-4 p-4 md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 items-end gap-3">
                  <Avatar
                    src={resolveMediaUrl(profile?.avatar_url ?? null) ?? undefined}
                    alt={displayName}
                    fallback={avatarFallback}
                    className="h-24 w-24 border-4 border-white bg-[rgb(var(--bg-soft))] text-2xl shadow-lg md:h-28 md:w-28"
                  />
                  <div className="min-w-0 pb-1">
                    <h1 className="truncate text-2xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-3xl">{displayName}</h1>
                    <p className="text-sm font-medium text-[rgb(var(--muted))]">{usernameHandle}</p>
                  </div>
                </div>
              {profile?.location ? <Badge variant="outline">{profile.location}</Badge> : null}
              </div>

              <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.65] p-3 text-sm text-[rgb(var(--text))] md:text-base">{bio}</p>

              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: "Posts", value: stats.posts.toLocaleString() },
                  { label: "Friends", value: stats.friends.toLocaleString() },
                  { label: "Comments", value: stats.comments.toLocaleString() },
                ].map((item) => (
                  <article key={item.label} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.55] p-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[rgb(var(--muted))]">{item.label}</p>
                    <p className="text-2xl font-black text-[rgb(var(--text-strong))]">{item.value}</p>
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 border-b border-[rgb(var(--border))] pb-2">
                <Button size="sm" variant={activeTab === "posts" ? "default" : "outline"} onClick={() => setActiveTab("posts")}>Posts</Button>
                <Button size="sm" variant={activeTab === "about" ? "default" : "outline"} onClick={() => setActiveTab("about")}>About</Button>
              </div>

              {activeTab === "about" ? (
                <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">Interests</p>
                  {interests.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {interests.map((interest) => (
                        <span key={interest} className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2.5 py-1 text-xs font-medium">
                          {interest}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[rgb(var(--muted))]">No interests selected yet.</p>
                  )}

                  <div className="mt-4 border-t border-[rgb(var(--border))] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">Friends</p>
                    {friends.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {friends.map((friend) => (
                          <span
                            key={friend.id}
                            className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--text-strong))]"
                          >
                            @{friend.username}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[rgb(var(--muted))]">No friends added yet.</p>
                    )}
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.4] p-3">
                  {isLoading ? (
                    <p className="text-sm text-[rgb(var(--muted))]">Loading profile…</p>
                  ) : posts.length === 0 ? (
                    <p className="text-sm text-[rgb(var(--muted))]">No posts yet for this profile.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {posts.map((post) => {
                        const mediaUrl = resolveMediaUrl(post.media_url);

                        return (
                          <article key={post.id} className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
                            {mediaUrl ? (
                              <Image
                                src={mediaUrl}
                                alt={post.title?.trim() || "Profile post"}
                                width={900}
                                height={680}
                                className="h-40 w-full object-cover"
                              />
                            ) : null}

                            <div className="space-y-1 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{toReadableDate(post.created_at)}</p>
                              <h3 className="line-clamp-2 text-base font-bold text-[rgb(var(--text-strong))]">{post.title?.trim() || "Untitled update"}</h3>
                              {post.content?.trim() ? <p className="line-clamp-3 text-sm text-[rgb(var(--muted))]">{post.content}</p> : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
