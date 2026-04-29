"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { UsernameActionPopup } from "@/components/social/username-action-popup";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveCacheUser, loadCachedThenRefresh, readCachedValue } from "@/lib/client-cache";
import { sendFriendRequestToProfile } from "@/lib/friend-requests";
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

  const [profileData, setProfileData] = useState<ProfileData>(() => {
    const activeUser = getActiveCacheUser();
    if (!activeUser || !requestedUsername) return EMPTY_PROFILE_DATA;
    return readCachedValue<ProfileData>(`member-profile:${activeUser}:${requestedUsername}:v1`, PROFILE_CACHE_MAX_AGE_MS) ?? EMPTY_PROFILE_DATA;
  });
  const [isLoading, setIsLoading] = useState(() => profileData.profile === null && profileData.posts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "about">("posts");
  const [friendRequestStatus, setFriendRequestStatus] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

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
      setViewerId(data.session?.user?.id ?? null);
      void loadMemberProfile(data.session?.user ?? null, data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setViewerId(session?.user?.id ?? null);
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

  const sendFriendRequest = async () => {
    if (!profile?.id || (viewerId && profile.id === viewerId)) return;
    setIsRequesting(true);
    const result = await sendFriendRequestToProfile({ id: profile?.id, username: profile?.username ?? requestedUsername });
    setFriendRequestStatus(result.message);
    setIsRequesting(false);
  };

  const isSelfProfile = Boolean(profile?.id && viewerId && profile.id === viewerId);

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className="min-w-0 w-full flex-1 overflow-y-auto bg-[rgb(var(--bg-deep))/0.6] p-3 md:p-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Card className="overflow-hidden border-[rgb(var(--border))] bg-[rgb(var(--card))]">
            <div className="relative h-40 bg-[radial-gradient(circle_at_95%_10%,rgb(var(--accent-soft))_0%,transparent_45%),linear-gradient(120deg,rgb(var(--brand))_0%,rgb(var(--accent-soft))_100%)] md:h-52">
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <Badge className="bg-white/20 text-white">Member profile</Badge>
                <UsernameActionPopup
                  variant="button"
                  displayName="Actions"
                  userId={profile?.id ?? null}
                  username={profile?.username ?? requestedUsername}
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
                    <p className="text-sm font-medium text-[rgb(var(--muted))]">{profileHandle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void sendFriendRequest()} disabled={isRequesting || isSelfProfile || !profile?.id}>
                    {isSelfProfile ? "Send friend request (disabled)" : isRequesting ? "Sending..." : "Send friend request"}
                  </Button>
                  {profile?.location ? <Badge variant="outline">{profile.location}</Badge> : null}
                </div>
              </div>

              <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.65] p-3 text-sm text-[rgb(var(--text))] md:text-base">{bio}</p>
              {friendRequestStatus ? <p className="text-sm text-[rgb(var(--muted))]">{friendRequestStatus}</p> : null}

              {loadError ? (
                <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm text-[rgb(var(--muted))]">
                  {loadError}
                </section>
              ) : null}

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
                    <p className="mt-2 text-sm text-[rgb(var(--muted))]">No interests listed yet.</p>
                  )}
                </section>
              ) : (
                <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.4] p-3">
                  {isLoading ? (
                    <p className="text-sm text-[rgb(var(--muted))]">Loading profile…</p>
                  ) : posts.length === 0 ? (
                    <p className="text-sm text-[rgb(var(--muted))]">No posts yet for this profile.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {posts.map((post) => (
                        <article key={post.id} className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]">
                          {post.media_url ? (
                            <Image
                              src={resolveMediaUrl(post.media_url) ?? post.media_url}
                              alt={post.title?.trim() || "Profile post"}
                              width={900}
                              height={680}
                              className="h-40 w-full object-cover"
                            />
                          ) : null}
                          <div className="space-y-1 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{toReadableDate(post.created_at)}</p>
                            <h3 className="line-clamp-2 text-base font-bold text-[rgb(var(--text-strong))]">{post.title?.trim() || "Untitled post"}</h3>
                            <p className="line-clamp-3 text-sm text-[rgb(var(--muted))]">{post.content?.trim() || "No description added."}</p>
                          </div>
                        </article>
                      ))}
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