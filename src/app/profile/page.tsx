"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type TabKey = "Overview" | "Posts" | "Comments" | "Gallery" | "Upvoted" | "Settings";
type FeedStyle = "balanced" | "magazine";

const tabs: TabKey[] = ["Overview", "Posts", "Comments", "Gallery", "Upvoted", "Settings"];

type MediaPost = { id: string; media_url: string | null; title: string | null; created_at: string };
type ProfilePost = { id: string; title: string | null; content: string | null; media_url: string | null; created_at: string };
type ProfileComment = { id: string; body: string | null; content: string | null; created_at: string };
type FriendStatus = "online" | "away" | "offline";
type Friend = { id: string; username: string; status: FriendStatus };
type FriendRequest = { id: string; username: string; mutualFriends: number };
type PrivacySettings = { showEmail: boolean; showActivity: boolean; allowFriendRequests: boolean };

type ProfileSettingsRow = {
  profile_primary: string;
  profile_secondary: string;
  show_email: boolean;
  show_activity: boolean;
  allow_friend_requests: boolean;
  feed_style: FeedStyle;
  friends: Friend[] | null;
  friend_requests: FriendRequest[] | null;
  introduction?: string | null;
};

const defaultSettings = {
  profilePrimary: "#1fd8b5",
  profileSecondary: "#112b44",
  feedStyle: "balanced" as FeedStyle,
  privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
  friends: [
    { id: "f1", username: "suntrail_sam", status: "online" as FriendStatus },
    { id: "f2", username: "openairlena", status: "away" as FriendStatus },
  ],
  friendRequests: [
    { id: "r1", username: "naturealex", mutualFriends: 3 },
    { id: "r2", username: "campmila", mutualFriends: 1 },
  ],
  introduction: "",
};

function formatRelativeTime(dateValue: string) {
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("Overview");
  const [profilePrimary, setProfilePrimary] = useState(defaultSettings.profilePrimary);
  const [profileSecondary, setProfileSecondary] = useState(defaultSettings.profileSecondary);
  const [feedStyle, setFeedStyle] = useState<FeedStyle>(defaultSettings.feedStyle);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultSettings.privacy);
  const [friends, setFriends] = useState<Friend[]>(defaultSettings.friends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(defaultSettings.friendRequests);
  const [introduction, setIntroduction] = useState(defaultSettings.introduction);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [profileComments, setProfileComments] = useState<ProfileComment[]>([]);
  const [mediaPosts, setMediaPosts] = useState<MediaPost[]>([]);
  const [badgesCount, setBadgesCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [userPostsCount, setUserPostsCount] = useState(0);
  const [commentsTableMissing, setCommentsTableMissing] = useState(false);
  const [loadedSettingsUserId, setLoadedSettingsUserId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const username = useMemo(() => {
    if (!user) return "Guest";
    return user.user_metadata?.username || user.email?.split("@")[0] || "Naturist";
  }, [user]);

  const engagement = useMemo(() => {
    if (totalPostsCount <= 0) return "0%";
    return `${Math.round((userPostsCount / totalPostsCount) * 100)}%`;
  }, [userPostsCount, totalPostsCount]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const authUser = data.session?.user ?? null;
      setUser(authUser);
      setProfileImageUrl((authUser?.user_metadata?.avatar_url as string) ?? "");
      setBannerImageUrl((authUser?.user_metadata?.banner_url as string) ?? "");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      setProfileImageUrl((authUser?.user_metadata?.avatar_url as string) ?? "");
      setBannerImageUrl((authUser?.user_metadata?.banner_url as string) ?? "");
      if (!authUser) {
        setProfilePosts([]);
        setProfileComments([]);
        setMediaPosts([]);
        setCommentsTableMissing(false);
        setLoadedSettingsUserId(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!user?.id) return;

      let query = await supabase
        .from("profile_settings")
        .select("profile_primary, profile_secondary, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests, introduction")
        .eq("user_id", user.id)
        .maybeSingle<ProfileSettingsRow>();

      if (query.error?.message?.includes("introduction")) {
        query = await supabase
          .from("profile_settings")
          .select("profile_primary, profile_secondary, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests")
          .eq("user_id", user.id)
          .maybeSingle<ProfileSettingsRow>();
      }

      const { data, error } = query;
      if (error) {
        console.error(error);
        setLoadedSettingsUserId(user.id);
        return;
      }

      if (!data) {
        const { error: createError } = await supabase.from("profile_settings").upsert(
          {
            user_id: user.id,
            profile_primary: defaultSettings.profilePrimary,
            profile_secondary: defaultSettings.profileSecondary,
            show_email: defaultSettings.privacy.showEmail,
            show_activity: defaultSettings.privacy.showActivity,
            allow_friend_requests: defaultSettings.privacy.allowFriendRequests,
            feed_style: defaultSettings.feedStyle,
            friends: defaultSettings.friends,
            friend_requests: defaultSettings.friendRequests,
            introduction: defaultSettings.introduction,
          },
          { onConflict: "user_id" },
        );

        if (createError && !createError.message.includes("introduction")) console.error(createError);
        setLoadedSettingsUserId(user.id);
        return;
      }

      setProfilePrimary(data.profile_primary ?? defaultSettings.profilePrimary);
      setProfileSecondary(data.profile_secondary ?? defaultSettings.profileSecondary);
      setFeedStyle(data.feed_style ?? defaultSettings.feedStyle);
      setPrivacy({
        showEmail: data.show_email ?? defaultSettings.privacy.showEmail,
        showActivity: data.show_activity ?? defaultSettings.privacy.showActivity,
        allowFriendRequests: data.allow_friend_requests ?? defaultSettings.privacy.allowFriendRequests,
      });
      setFriends(data.friends ?? defaultSettings.friends);
      setFriendRequests(data.friend_requests ?? defaultSettings.friendRequests);
      setIntroduction(data.introduction ?? defaultSettings.introduction);
      setLoadedSettingsUserId(user.id);
    }

    void loadSettings();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || loadedSettingsUserId !== user.id) return;

    const timeout = window.setTimeout(async () => {
      const payload = {
        user_id: user.id,
        profile_primary: profilePrimary,
        profile_secondary: profileSecondary,
        show_email: privacy.showEmail,
        show_activity: privacy.showActivity,
        allow_friend_requests: privacy.allowFriendRequests,
        feed_style: feedStyle,
        friends,
        friend_requests: friendRequests,
        introduction,
      };

      let { error } = await supabase.from("profile_settings").upsert(payload, { onConflict: "user_id" });

      if (error?.message?.includes("introduction")) {
        const withoutIntroduction = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "introduction"));
        error = (await supabase.from("profile_settings").upsert(withoutIntroduction, { onConflict: "user_id" })).error;
      }

      if (error) console.error(error);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [user?.id, loadedSettingsUserId, profilePrimary, profileSecondary, feedStyle, privacy, friends, friendRequests, introduction]);

  useEffect(() => {
    async function loadProfileData() {
      if (!user?.id) return;

      const postsResult = await supabase.from("posts").select("id, title, content, media_url, created_at", { count: "exact" }).eq("author_id", user.id).order("created_at", { ascending: false });
      if (!postsResult.error) {
        const posts = (postsResult.data ?? []) as ProfilePost[];
        setProfilePosts(posts);
        setUserPostsCount(postsResult.count ?? 0);
        setMediaPosts(posts.filter((post) => Boolean(post.media_url)) as MediaPost[]);
      }

      const totalPostsResult = await supabase.from("posts").select("id", { count: "exact", head: true });
      if (!totalPostsResult.error) setTotalPostsCount(totalPostsResult.count ?? 0);

      const commentsResult = await supabase.from("comments").select("id, body, content, created_at").eq("author_id", user.id).order("created_at", { ascending: false });
      if (!commentsResult.error) setProfileComments((commentsResult.data ?? []) as ProfileComment[]);
      else if (commentsResult.error.message.includes("relation") || commentsResult.error.message.includes("does not exist")) setCommentsTableMissing(true);

      const followersResult = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("friend_user_id", user.id);
      if (!followersResult.error) setFollowersCount(followersResult.count ?? 0);

      const followingResult = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (!followingResult.error) setFollowingCount(followingResult.count ?? 0);

      let badgesResult = await supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (badgesResult.error) badgesResult = await supabase.from("badges").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (!badgesResult.error) setBadgesCount(badgesResult.count ?? 0);
    }

    void loadProfileData();
  }, [user?.id]);

  function updatePrivacy<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    setPrivacy((current) => ({ ...current, [key]: value }));
  }

  function handleImageUpload(file: File | null, target: "avatar" | "banner") {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = typeof reader.result === "string" ? reader.result : "";
      if (!imageData) return;
      if (target === "avatar") setProfileImageUrl(imageData);
      if (target === "banner") setBannerImageUrl(imageData);
    };
    reader.readAsDataURL(file);
  }

  const statCards = [
    { label: "Followers", value: followersCount.toLocaleString() },
    { label: "Following", value: followingCount.toLocaleString() },
    { label: "Posts", value: userPostsCount.toLocaleString() },
    { label: "Engagement", value: engagement },
    { label: "Badges", value: badgesCount.toLocaleString() },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.2),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.12),transparent_25%),#0a0b10] text-[#eef2ff]">
      <main className="min-h-screen p-3 sm:p-6">
        <div className="mx-auto grid min-h-[calc(100vh-24px)] w-full max-w-[1360px] grid-cols-1 overflow-hidden rounded-[26px] border border-[#242941] bg-gradient-to-b from-white/[0.02] to-white/[0] shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-48px)] lg:grid-cols-[250px_1fr_320px]">
          <aside className="border-b border-[#242941] bg-[rgba(9,11,19,0.66)] px-4 py-[22px] lg:border-b-0 lg:border-r">
            <div className="mb-2 text-[22px] font-bold">Profile <span className="text-[#7c5cff]">Hub</span></div>
            <p className="mb-5 text-xs text-[#8e97b8]">Use this left menu for profile sections, settings, and gallery.</p>
            <div className="mb-[22px] grid gap-2 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-3 py-[11px] text-left ${activeTab === tab ? "border border-[rgba(124,92,255,0.4)] bg-[rgba(124,92,255,0.16)] text-[#eef2ff]" : "border border-transparent text-[#8e97b8]"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </aside>

          <section className="overflow-hidden p-[14px] sm:p-[22px]">
            <section className="mb-4 overflow-hidden rounded-[18px] border border-[#242941] bg-[#121522]">
              {bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="Profile banner" className="h-[150px] w-full object-cover opacity-70" />
              ) : (
                <div className="h-[150px] w-full bg-[linear-gradient(135deg,rgba(124,92,255,0.5),rgba(45,212,191,0.25))]" />
              )}
              <div className="-mt-8 flex items-end gap-3 p-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-[#1a1f33] bg-gradient-to-br from-[#8d76ff] to-[#2dd4bf] text-lg font-semibold text-white">
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{username}</h1>
                  <p className="text-xs text-[#8e97b8]">@{user?.email?.split("@")[0] ?? "naturist"}</p>
                  {introduction ? <p className="mt-1 text-sm text-[#dce2ff]">{introduction}</p> : null}
                </div>
              </div>
            </section>

            {activeTab === "Overview" && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statCards.map((stat) => <article key={stat.label} className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px]"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-sm text-[#8e97b8]">{stat.label}</p></article>)}</section>}

            {activeTab === "Posts" && (
              <section className="grid max-h-[620px] grid-cols-1 gap-3 overflow-y-auto pr-1">
                {profilePosts.length === 0 ? <article className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px] text-sm text-[#8e97b8]">No posts yet.</article> : profilePosts.map((post) => (
                  <article key={post.id} className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px]">
                    <div className="mb-[10px] flex items-start justify-between"><div><strong className="block text-sm">{post.title ?? "Untitled post"}</strong><span className="text-xs text-[#8e97b8]">{formatRelativeTime(post.created_at)}</span></div></div>
                    <p className="mb-[10px] text-[13px] text-[#dce2ff]">{post.content ?? "No post content yet."}</p>
                    {post.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.media_url} alt={post.title ?? "Post media"} className="h-[130px] w-full rounded-[14px] border border-[#2b3150] object-cover" />
                    ) : null}
                  </article>
                ))}
              </section>
            )}

            {activeTab === "Comments" && <section className="space-y-2 text-sm">{commentsTableMissing ? <p className="text-[#8e97b8]">Comments table not available in this environment.</p> : null}{!commentsTableMissing && profileComments.length === 0 ? <p className="text-[#8e97b8]">No comments yet.</p> : null}{profileComments.map((comment) => <article key={comment.id} className="rounded-xl border border-[#242941] bg-[#121522] p-3"><p className="text-xs text-[#8e97b8]">{formatRelativeTime(comment.created_at)}</p><p className="mt-1 text-[#dce2ff]">{comment.body ?? comment.content}</p></article>)}</section>}

            {activeTab === "Gallery" && (
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mediaPosts.length === 0 ? <p className="text-sm text-[#8e97b8]">No media posts yet.</p> : mediaPosts.map((post) => (
                  <article key={post.id} className="overflow-hidden rounded-2xl border border-[#242941] bg-[#121522]">
                    {post.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.media_url} alt={post.title ?? "Gallery image"} className="h-44 w-full object-cover" />
                    ) : null}
                    <div className="p-3 text-sm">{post.title ?? "Untitled"}</div>
                  </article>
                ))}
              </section>
            )}

            {activeTab === "Upvoted" && <p className="text-sm text-[#8e97b8]">Upvoted content will appear here once vote tracking is enabled.</p>}

            {activeTab === "Settings" && (
              <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Profile basics</h3>
                  <textarea value={introduction} onChange={(event) => setIntroduction(event.target.value.slice(0, 220))} className="mt-3 h-24 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] p-3" placeholder="Short introduction" />
                  <label className="mt-3 block">Profile image URL<input value={profileImageUrl} onChange={(event) => setProfileImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] px-3 py-2" /></label>
                  <label className="mt-3 block">Banner image URL<input value={bannerImageUrl} onChange={(event) => setBannerImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] px-3 py-2" /></label>
                </article>
                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Experience + privacy</h3>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setFeedStyle("balanced")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "balanced" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>Balanced</button>
                    <button type="button" onClick={() => setFeedStyle("magazine")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "magazine" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>Magazine</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
                  </div>
                  <p className="mt-3 text-xs text-[#8e97b8]">Friends: {friends.length} · Pending requests: {friendRequests.length}</p>
                </article>
              </section>
            )}
          </section>

          <aside className="border-t border-[#242941] bg-[rgba(9,11,19,0.66)] p-[22px_18px] lg:border-l lg:border-t-0">
            <div className="mb-3 text-[13px] text-[#8e97b8]">Profile overview</div>
            <div className="mb-[18px] rounded-[14px] border border-[#242941] bg-[#121522] px-3 pb-3 pt-[18px] text-center">
              <div className="mx-auto mb-[10px] flex h-[66px] w-[66px] items-center justify-center overflow-hidden rounded-full border-2 border-[rgba(124,92,255,0.45)] bg-gradient-to-br from-[#7c5cff] to-[#2dd4bf]">
                {profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{username.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <strong>{username}</strong>
              <div className="mt-0.5 text-xs text-[#8e97b8]">@{user?.email?.split("@")[0] ?? "naturist"}</div>
              <div className="mt-[14px] grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2"><strong className="block text-[13px]">{followersCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Followers</span></div>
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2"><strong className="block text-[13px]">{followingCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Following</span></div>
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2"><strong className="block text-[13px]">{userPostsCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Posts</span></div>
              </div>
            </div>

            <div className="mb-3 text-[13px] text-[#8e97b8]">Profile media</div>
            <div className="space-y-3 rounded-[14px] border border-[#242941] bg-[#121522] p-3">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null, "avatar")}
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null, "banner")}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="w-full rounded-xl border border-[#2b3150] bg-[#171c2d] px-3 py-2 text-left text-xs font-semibold text-[#dce2ff] transition hover:border-[#4c5a8f]"
              >
                Change avatar image
              </button>
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="w-full rounded-xl border border-[#2b3150] bg-[#171c2d] px-3 py-2 text-left text-xs font-semibold text-[#dce2ff] transition hover:border-[#4c5a8f]"
              >
                Change banner image
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
