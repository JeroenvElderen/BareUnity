"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
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

const avatarExamples = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=300&q=80",
];

const bannerExamples = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=800&q=80",
];

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

export default function ProfilePage() {
  const router = useRouter();
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

        if (createError && !createError.message.includes("introduction")) {
          console.error(createError);
        }

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

  const statCards = [
    { label: "Followers", value: followersCount.toLocaleString() },
    { label: "Following", value: followingCount.toLocaleString() },
    { label: "Posts", value: userPostsCount.toLocaleString() },
    { label: "Engagement", value: engagement },
    { label: "Badges", value: badgesCount.toLocaleString() },
  ];

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar
          onHomeSelect={() => router.push("/")}
          onChannelSelect={() => router.push("/")}
          isHomeActive={false}
        />

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-[min(76rem,calc(100vw-8.5rem))] space-y-4">
            <section className="relative overflow-hidden rounded-3xl border border-accent/20 bg-card/55 p-5">
              {bannerImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="Profile banner" className="absolute inset-0 h-full w-full object-cover opacity-35" />
              )}
              <div className="relative flex items-end gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-bg bg-accent/25 text-2xl font-bold text-text">
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{username}</h1>
                  <p className="text-sm text-muted">Naturist member profile</p>
                  {introduction && <p className="mt-2 max-w-3xl text-sm text-text/90">{introduction}</p>}
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {statCards.map((stat) => (
                <article key={stat.label} className="glass-card p-4">
                  <p className="text-2xl font-semibold leading-none">{stat.value}</p>
                  <p className="mt-1 text-sm text-muted">{stat.label}</p>
                </article>
              ))}
            </section>

            <section className="glass-card p-4">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-full px-3 py-1 text-sm ${activeTab === tab ? "bg-accent text-[#08232c]" : "border border-accent/30 text-text"}`}>
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === "Overview" && <p className="mt-4 text-sm text-muted">Track your profile highlights, reach, and settings from one unified place.</p>}

              {activeTab === "Posts" && (
                <div className="mt-4 space-y-3">
                  {profilePosts.length === 0 ? <p className="text-sm text-muted">No posts yet.</p> : profilePosts.map((post) => (
                    <article key={post.id} className="rounded-2xl border border-accent/20 bg-bg/40 p-4">
                      <p className="text-xs text-muted">{new Date(post.created_at).toLocaleString()}</p>
                      {post.title && <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>}
                      {post.content && <p className="mt-2 text-sm text-text/90">{post.content}</p>}
                    </article>
                  ))}
                </div>
              )}

              {activeTab === "Comments" && (
                <div className="mt-4 space-y-2 text-sm">
                  {commentsTableMissing ? <p className="text-muted">Comments table not available in this environment.</p> : null}
                  {!commentsTableMissing && profileComments.length === 0 ? <p className="text-muted">No comments yet.</p> : profileComments.map((comment) => (
                    <article key={comment.id} className="rounded-xl border border-accent/20 bg-bg/40 p-3">
                      <p className="text-xs text-muted">{new Date(comment.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-text/90">{comment.body ?? comment.content}</p>
                    </article>
                  ))}
                </div>
              )}

              {activeTab === "Gallery" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mediaPosts.length === 0 ? <p className="text-sm text-muted">No media posts yet.</p> : mediaPosts.map((post) => (
                    <article key={post.id} className="overflow-hidden rounded-2xl border border-accent/20 bg-bg/30">
                      {post.media_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.media_url} alt={post.title ?? "Gallery image"} className="h-44 w-full object-cover" />
                      )}
                      <div className="p-3 text-sm">{post.title ?? "Untitled"}</div>
                    </article>
                  ))}
                </div>
              )}

              {activeTab === "Upvoted" && <p className="mt-4 text-sm text-muted">Upvoted content will appear here once vote tracking is enabled.</p>}

              {activeTab === "Settings" && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-accent/20 bg-bg/35 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">Image examples</h3>
                    <p className="mt-1 text-xs text-muted">Pick a suggested avatar or banner to match the site style.</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {avatarExamples.map((url) => (
                        <button key={url} type="button" onClick={() => setProfileImageUrl(url)} className="overflow-hidden rounded-xl border border-accent/25">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Avatar example" className="h-16 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {bannerExamples.map((url) => (
                        <button key={url} type="button" onClick={() => setBannerImageUrl(url)} className="overflow-hidden rounded-xl border border-accent/25">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Banner example" className="h-20 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-accent/20 bg-bg/35 p-4 text-sm">
                    <h3 className="font-semibold uppercase tracking-wider text-accent">Profile settings</h3>
                    <textarea value={introduction} onChange={(event) => setIntroduction(event.target.value.slice(0, 220))} className="mt-3 h-24 w-full rounded-xl border border-accent/20 bg-bg/50 p-3" placeholder="Short introduction" />
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label>Primary<input type="color" value={profilePrimary} onChange={(event) => setProfilePrimary(event.target.value)} className="mt-1 h-9 w-full" /></label>
                      <label>Secondary<input type="color" value={profileSecondary} onChange={(event) => setProfileSecondary(event.target.value)} className="mt-1 h-9 w-full" /></label>
                    </div>
                    <label className="mt-3 block">Profile image URL<input value={profileImageUrl} onChange={(event) => setProfileImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg/50 px-3 py-2" /></label>
                    <label className="mt-3 block">Banner image URL<input value={bannerImageUrl} onChange={(event) => setBannerImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg/50 px-3 py-2" /></label>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setFeedStyle("balanced")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "balanced" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>Balanced</button>
                      <button type="button" onClick={() => setFeedStyle("magazine")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "magazine" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>Magazine</button>
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
                      <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
                      <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
                    </div>
                    <p className="mt-3 text-xs text-muted">Friends: {friends.length} · Pending requests: {friendRequests.length}</p>
                  </section>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
