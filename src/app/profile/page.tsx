"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  interests: string[];
  stats: { posts: number; friends: number; comments: number };
};

const EMPTY_PROFILE_DATA: ProfileData = {
  profile: null,
  posts: [],
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
  const [profileResult, postsResult, settingsResult, postsCountResult, friendsCountResult, commentsCountResult] = await Promise.all([
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
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (postsResult.error) throw postsResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (postsCountResult.error) throw postsCountResult.error;
  if (friendsCountResult.error) throw friendsCountResult.error;
  if (commentsCountResult.error) throw commentsCountResult.error;

  return {
    profile: profileResult.data ?? null,
    posts: (postsResult.data ?? []) as PostRow[],
    interests: (settingsResult.data?.interests ?? []).slice(0, 8),
    stats: {
      posts: postsCountResult.count ?? 0,
      friends: friendsCountResult.count ?? 0,
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

  const loadProfileForUser = useCallback(async (sessionUser: User | null) => {
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
      }setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      void loadProfileForUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfileForUser(session?.user ?? null);
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
  
  const { profile, posts, interests, stats } = profileData;

  const displayName =
    profile?.display_name?.trim() ||
    profile?.username ||
    "BareUnity Member";

  const bio =
    profile?.bio?.trim() ||
    "Nature-first connection, consent-forward gatherings, and calm community rituals.";

  const avatarFallback = getInitials(displayName);

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className="min-w-0 w-full flex-1 overflow-hidden bg-[rgb(var(--bg-deep))/0.55]">
        <Card className="min-h-full w-full max-w-full overflow-hidden rounded-none border-x-0 border-y-0 border-[rgb(var(--border))] bg-[rgb(var(--card))/0.98] shadow-none">
          <div className="relative h-40 border-b border-[rgb(var(--border))/0.75] bg-[linear-gradient(110deg,rgb(var(--brand))_0%,rgb(var(--accent-soft))_100%)] md:h-48" />

          <div className="-mt-16 pl-0 md:-mt-20 md:pl-1">
            <Avatar
              src={resolveMediaUrl(profile?.avatar_url ?? null) ?? undefined}
              alt={displayName}
              fallback={avatarFallback}
              className="h-24 w-24 border-4 border-white bg-[rgb(var(--bg-soft))] text-2xl shadow-lg md:h-28 md:w-28"
            />
          </div>
          <CardContent className="space-y-4 p-3 md:p-5 min-w-0 overflow-hidden">
            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4 min-w-0">
              <h1 className="break-words text-3xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-4xl">
                {displayName}
              </h1>
              <p className="mt-1 break-words text-base text-[rgb(var(--muted))] md:text-lg">
                {bio}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))]">
                  Verified
                </Badge>
                {profile?.location ? (
                  <Badge variant="outline">{profile.location}</Badge>
                ) : null}
              </div>
            </section>

            <section className="grid gap-2.5 md:grid-cols-3">
              {[
                { label: "Posts", value: stats.posts.toLocaleString() },
                { label: "Friends", value: stats.friends.toLocaleString() },
                { label: "Comments", value: stats.comments.toLocaleString() },
              ].map((item) => (
                <article
                  key={item.label}
                  className="rounded-xl border border-[rgb(var(--border))] bg-white p-3 min-w-0"
                >
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">
                    {item.label}
                  </p>
                  <p className="text-2xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-3xl">
                    {item.value}
                  </p>
                </article>
              ))}
            </section>

            {interests.length > 0 && (
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4 min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">
                  Interests
                </p>
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-[rgb(var(--bg-soft))] px-2.5 py-1 text-xs font-medium break-words"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4 min-w-0 overflow-hidden">
              {isLoading ? (
                <p className="text-sm text-[rgb(var(--muted))]">Loading profile…</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-[rgb(var(--muted))]">
                  No posts yet for this profile.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {posts.map((post) => {
                    const mediaUrl = resolveMediaUrl(post.media_url);

                    return (
                      <article
                        key={post.id}
                        className="w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45]"
                      >
                        {mediaUrl && (
                          <Image
                            src={mediaUrl}
                            alt={post.title?.trim() || "Profile post"}
                            width={900}
                            height={680}
                            className="w-full h-auto max-w-full object-cover"
                          />
                        )}

                        <div className="p-3 min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                            {toReadableDate(post.created_at)}
                          </p>

                          <h3 className="mt-1 break-words text-base font-bold text-[rgb(var(--text-strong))]">
                            {post.title?.trim() || "Untitled update"}
                          </h3>

                          {post.content?.trim() && (
                            <p className="mt-1 break-words text-sm text-[rgb(var(--muted))]">
                              {post.content.slice(0, 180)}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
