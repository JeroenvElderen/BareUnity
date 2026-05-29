"use client";

import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { UsernameActionPopup } from "@/components/social/username-action-popup";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveCacheUser, loadCachedThenRefresh, readCachedValue } from "@/lib/client-cache";
import { PROFILE_REALTIME_TABLES, subscribeToTables } from "@/lib/realtime";
import { subscribeToSocialGraphUpdates } from "@/lib/social-graph-events";
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

type EditableProfileFields = {
  displayName: string;
  bio: string;
  location: string;
  interests: string;
};

const EMPTY_PROFILE_DATA: ProfileData = {
  profile: null,
  posts: [],
  friends: [],
  interests: [],
  stats: { posts: 0, friends: 0, comments: 0 },
};
const PROFILE_CACHE_MAX_AGE_MS = 1000 * 60 * 3;
const DEFAULT_PROFILE_BIO = "Nature-first connection, consent-forward gatherings, and calm community rituals.";

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

function resolveMediaUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith("http")) return value;

  const knownStoragePath = ["avatars/", "gallery/", "posts/"].some((prefix) => value.startsWith(prefix));
  const normalizedPath = knownStoragePath ? value : `posts/${value}`;
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
      .select("id, friend_user_id, friend_username")
      .eq("user_id", userId)
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
      .select("friend_user_id")
      .eq("user_id", userId),
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
    if (!friend.friend_user_id || friendsById.has(friend.friend_user_id)) {
      continue;
    }

    friendsById.set(friend.friend_user_id, {
      id: friend.friend_user_id,
      username: friend.friend_username ?? "member",
    });
  }

  const uniqueFriendIds = new Set(
    (friendsCountResult.data ?? []).map((friendship) => friendship.friend_user_id).filter((friendId): friendId is string => Boolean(friendId)),
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
  const [profileData, setProfileData] = useState<ProfileData>(() => {
    const activeUser = getActiveCacheUser();
    if (!activeUser) return EMPTY_PROFILE_DATA;
    return readCachedValue<ProfileData>(`profile:${activeUser}:v2`, PROFILE_CACHE_MAX_AGE_MS) ?? EMPTY_PROFILE_DATA;
  });
  const [isLoading, setIsLoading] = useState(() => profileData.profile === null && profileData.posts.length === 0);
  const [sessionContext, setSessionContext] = useState<{ user: User | null; accessToken: string | null }>({
    user: null,
    accessToken: null,
  });
  const [activeTab, setActiveTab] = useState<"posts" | "about">("posts");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editableProfile, setEditableProfile] = useState<EditableProfileFields>({
    displayName: "",
    bio: "",
    location: "",
    interests: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileSaveStatus, setProfileSaveStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  useEffect(() => {
    if (!sessionContext.user || !sessionContext.accessToken) return;

    return subscribeToSocialGraphUpdates(() => {
      void loadProfileForUser(sessionContext.user, sessionContext.accessToken, { background: true });
    });
  }, [loadProfileForUser, sessionContext.accessToken, sessionContext.user]);
  
  useEffect(() => {
    setEditableProfile({
      displayName: profileData.profile?.display_name?.trim() ?? "",
      bio: profileData.profile?.bio?.trim() ?? "",
      location: profileData.profile?.location?.trim() ?? "",
      interests: profileData.interests.join(", "),
    });
  }, [profileData.interests, profileData.profile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const { profile, posts, friends, interests, stats } = profileData;

  const displayName =
    profile?.display_name?.trim() ||
    profile?.username ||
    "BareUnity Member";

  const bio =
    profile?.bio?.trim() ||
    DEFAULT_PROFILE_BIO;

  const avatarFallback = getInitials(displayName);
  const usernameHandle = useMemo(() => `@${profile?.username ?? "member"}`, [profile?.username]);
  const avatarSrc = avatarPreviewUrl ?? resolveMediaUrl(profile?.avatar_url ?? null) ?? undefined;

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionContext.accessToken) {
      setProfileSaveStatus({ type: "error", message: "Please sign in before editing your profile." });
      return;
    }

    const formData = new FormData();
    formData.set("displayName", editableProfile.displayName);
    formData.set("bio", editableProfile.bio);
    formData.set("location", editableProfile.location);
    formData.set("interests", editableProfile.interests);
    if (avatarFile) {
      formData.set("avatar", avatarFile);
    }

    setIsSavingProfile(true);
    setProfileSaveStatus(null);

    try {
      const response = await fetch("/api/profile/update", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionContext.accessToken}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update profile.");
      }

      setProfileSaveStatus({ type: "success", message: "Profile updated." });
      setAvatarFile(null);
      setIsEditingProfile(false);
      await loadProfileForUser(sessionContext.user, sessionContext.accessToken, { background: true });
    } catch (error) {
      setProfileSaveStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update profile.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

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
                    src={avatarSrc}
                    alt={displayName}
                    fallback={avatarFallback}
                    className="h-24 w-24 border-4 border-white bg-[rgb(var(--bg-soft))] text-2xl shadow-lg md:h-28 md:w-28"
                  />
                  <div className="min-w-0 pb-1">
                    <h1 className="truncate text-2xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-3xl">{displayName}</h1>
                    <p className="text-sm font-medium text-[rgb(var(--muted))]">{usernameHandle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {profile?.location ? <Badge variant="outline">{profile.location}</Badge> : null}
                  <Button
                    size="sm"
                    variant={isEditingProfile ? "secondary" : "outline"}
                    onClick={() => {
                      setIsEditingProfile((current) => !current);
                      setProfileSaveStatus(null);
                    }}
                  >
                    {isEditingProfile ? "Close editor" : "Edit profile"}
                  </Button>
                </div>
              </div>

              <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.65] p-3 text-sm text-[rgb(var(--text))] md:text-base">{bio}</p>

              {profileSaveStatus ? (
                <p
                  className={`rounded-xl border p-3 text-sm font-semibold ${
                    profileSaveStatus.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {profileSaveStatus.message}
                </p>
              ) : null}

              {isEditingProfile ? (
                <form
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.6] p-4 shadow-sm"
                  onSubmit={handleProfileSave}
                >
                  <div className="flex flex-col gap-4 md:flex-row">
                    <label className="flex min-w-44 flex-col gap-2 text-sm font-semibold text-[rgb(var(--text-strong))]">
                      Profile picture
                      <input
                        accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
                        className="text-sm text-[rgb(var(--muted))] file:mr-3 file:rounded-full file:border-0 file:bg-[rgb(var(--brand))] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                        type="file"
                        onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                      />
                      <span className="text-xs font-medium text-[rgb(var(--muted))]">JPG, PNG, WEBP, GIF, or AVIF up to 4MB.</span>
                    </label>

                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-sm font-semibold text-[rgb(var(--text-strong))]">
                        Display name
                        <input
                          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-strong))] outline-none focus:border-[rgb(var(--brand))]"
                          maxLength={80}
                          placeholder="Your display name"
                          value={editableProfile.displayName}
                          onChange={(event) => setEditableProfile((current) => ({ ...current, displayName: event.target.value }))}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5 text-sm font-semibold text-[rgb(var(--text-strong))]">
                        Location
                        <input
                          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-strong))] outline-none focus:border-[rgb(var(--brand))]"
                          maxLength={80}
                          placeholder="City, region, or vibe"
                          value={editableProfile.location}
                          onChange={(event) => setEditableProfile((current) => ({ ...current, location: event.target.value }))}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5 text-sm font-semibold text-[rgb(var(--text-strong))] md:col-span-2">
                        Bio
                        <textarea
                          className="min-h-24 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-strong))] outline-none focus:border-[rgb(var(--brand))]"
                          maxLength={280}
                          placeholder={DEFAULT_PROFILE_BIO}
                          value={editableProfile.bio}
                          onChange={(event) => setEditableProfile((current) => ({ ...current, bio: event.target.value }))}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5 text-sm font-semibold text-[rgb(var(--text-strong))] md:col-span-2">
                        Interests
                        <input
                          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 text-sm font-medium text-[rgb(var(--text-strong))] outline-none focus:border-[rgb(var(--brand))]"
                          placeholder="Beach walks, wellness, hiking"
                          value={editableProfile.interests}
                          onChange={(event) => setEditableProfile((current) => ({ ...current, interests: event.target.value }))}
                        />
                        <span className="text-xs font-medium text-[rgb(var(--muted))]">Separate up to 8 interests with commas.</span>
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAvatarFile(null);
                        setIsEditingProfile(false);
                        setProfileSaveStatus(null);
                        setEditableProfile({
                          displayName: profile?.display_name?.trim() ?? "",
                          bio: profile?.bio?.trim() ?? "",
                          location: profile?.location?.trim() ?? "",
                          interests: interests.join(", "),
                        });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSavingProfile}>
                      {isSavingProfile ? "Saving…" : "Save profile"}
                    </Button>
                  </div>
                </form>
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
