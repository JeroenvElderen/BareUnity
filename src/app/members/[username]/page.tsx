"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadCachedThenRefresh } from "@/lib/client-cache";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeUsername } from "@/lib/username";
import layoutStyles from "../../page.module.css";

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

const PROFILE_CACHE_MAX_AGE_MS = 1000 * 60 * 2;

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

async function getProfileDataForMember(accessToken: string, username: string): Promise<ProfileData> {
  const response = await fetch(`/api/members/${encodeURIComponent(username)}/snapshot`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Member profile snapshot request failed (${response.status})`);
  }

  return (await response.json()) as ProfileData;
}

export default function MemberProfilePage() {
  const params = useParams<{ username: string }>();
  const requestedUsername = normalizeUsername(decodeURIComponent(params?.username ?? ""));

  const [profileData, setProfileData] = useState<ProfileData>(EMPTY_PROFILE_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMemberProfile = useCallback(async (sessionUser: User | null, accessToken: string | null) => {
    if (!isSupabaseConfigured || !sessionUser || !accessToken || !requestedUsername) {
      setProfileData(EMPTY_PROFILE_DATA);
      setIsLoading(false);
      setLoadError("Members must be signed in to view profiles.");
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await loadCachedThenRefresh<ProfileData>({
        key: `member-profile:${sessionUser.id}:${requestedUsername}:v1`,
        maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
        onCachedData: (cached) => {
          setProfileData(cached);
          setIsLoading(false);
        },
        fetchFresh: () => getProfileDataForMember(accessToken, requestedUsername),
      });
      setProfileData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load member profile.";
      setLoadError(message);
      setProfileData(EMPTY_PROFILE_DATA);
    } finally {
      setIsLoading(false);
    }
  }, [requestedUsername]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      void loadMemberProfile(data.session?.user ?? null, data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadMemberProfile(session?.user ?? null, session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMemberProfile]);

  const { profile, posts, interests, stats } = profileData;

  const displayName =
    profile?.display_name?.trim() ||
    profile?.username ||
    "BareUnity Member";

  const bio =
    profile?.bio?.trim() ||
    "Nature-first connection, consent-forward gatherings, and calm community rituals.";

  const avatarFallback = getInitials(displayName);
  const profileHandle = useMemo(() => {
    if (profile?.username) return `@${profile.username}`;
    return requestedUsername ? `@${requestedUsername}` : "@member";
  }, [profile?.username, requestedUsername]);

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
            <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3.5 md:p-4 min-w-0">
              <h1 className="break-words text-3xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-4xl">
                {displayName}
              </h1>
              <p className="text-sm font-medium text-[rgb(var(--muted))]">{profileHandle}</p>
              <p className="mt-1 break-words text-base text-[rgb(var(--muted))] md:text-lg">
                {bio}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))]">
                  Member profile
                </Badge>
                {profile?.location ? (
                  <Badge variant="outline">{profile.location}</Badge>
                ) : null}
              </div>
            </section>

            {loadError ? (
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm text-[rgb(var(--muted))]">
                {loadError}
              </section>
            ) : null}

            <section className="grid gap-2.5 md:grid-cols-3">
              {[
                { label: "Posts", value: stats.posts.toLocaleString() },
                { label: "Friends", value: stats.friends.toLocaleString() },
                { label: "Comments", value: stats.comments.toLocaleString() },
              ].map((item) => (
                <article
                  key={item.label}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 min-w-0"
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
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3.5 md:p-4 min-w-0">
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

            <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3.5 md:p-4 min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">
                Recent posts
              </p>

              {isLoading ? (
                <p className="text-sm text-[rgb(var(--muted))]">Loading profile…</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-[rgb(var(--muted))]">No posts yet for this profile.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {posts.map((post) => (
                    <article
                      key={post.id}
                      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-2.5"
                    >
                      {post.media_url ? (
                        <div className="relative mb-2 h-36 w-full overflow-hidden rounded-lg bg-black/5">
                          <Image
                            src={resolveMediaUrl(post.media_url) ?? post.media_url}
                            alt={post.title?.trim() || "Profile post"}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 45vw, 30vw"
                          />
                        </div>
                      ) : null}
                      <h3 className="line-clamp-2 text-sm font-semibold text-[rgb(var(--text-strong))]">
                        {post.title?.trim() || "Untitled post"}
                      </h3>
                      <p className="mt-1 line-clamp-3 text-xs text-[rgb(var(--muted))]">
                        {post.content?.trim() || "No description added."}
                      </p>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted))]">
                        {toReadableDate(post.created_at)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}