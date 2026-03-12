"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

    loadSettings();
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
        const withoutIntroduction = { ...payload };
        delete withoutIntroduction.introduction;
        error = (await supabase.from("profile_settings").upsert(withoutIntroduction, { onConflict: "user_id" })).error;
      }

      if (error) console.error(error);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [user?.id, loadedSettingsUserId, profilePrimary, profileSecondary, feedStyle, privacy, friends, friendRequests, introduction]);

  useEffect(() => {
    async function loadProfileData() {
      if (!user?.id) return;

      const postsResult = await supabase
        .from("posts")
        .select("id, title, content, media_url, created_at", { count: "exact" })
        .eq("author_id", user.id)
        .order("created_at", { ascending: false });
      if (!postsResult.error) {
        const posts = (postsResult.data ?? []) as ProfilePost[];
        setProfilePosts(posts);
        setUserPostsCount(postsResult.count ?? 0);
        setMediaPosts(posts.filter((post) => Boolean(post.media_url)) as MediaPost[]);
      }

      const totalPostsResult = await supabase.from("posts").select("id", { count: "exact", head: true });
      if (!totalPostsResult.error) setTotalPostsCount(totalPostsResult.count ?? 0);

      const commentsResult = await supabase
        .from("comments")
        .select("id, body, content, created_at")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false });
      if (!commentsResult.error) {
        setProfileComments((commentsResult.data ?? []) as ProfileComment[]);
      } else if (commentsResult.error.message.includes("relation") || commentsResult.error.message.includes("does not exist")) {
        setCommentsTableMissing(true);
      }

      const followersResult = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("friend_user_id", user.id);
      if (!followersResult.error) setFollowersCount(followersResult.count ?? 0);

      const followingResult = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (!followingResult.error) setFollowingCount(followingResult.count ?? 0);

      let badgesResult = await supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (badgesResult.error) {
        badgesResult = await supabase.from("badges").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      }
      if (!badgesResult.error) setBadgesCount(badgesResult.count ?? 0);
    }

    loadProfileData();
  }, [user?.id]);

  function updatePrivacy<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    setPrivacy((current) => ({ ...current, [key]: value }));
  }

  function acceptRequest(request: FriendRequest) {
    setFriendRequests((current) => current.filter((item) => item.id !== request.id));
    setFriends((current) => [...current, { id: `friend-${request.id}`, username: request.username, status: "online" }]);
  }

  function declineRequest(id: string) {
    setFriendRequests((current) => current.filter((item) => item.id !== id));
  }

  const statCards = [
    { label: "Followers", value: followersCount.toLocaleString() },
    { label: "Following", value: followingCount.toLocaleString() },
    { label: "Posts", value: userPostsCount.toLocaleString() },
    { label: "Engagement", value: engagement },
    { label: "Badges", value: badgesCount.toLocaleString() },
  ];

  return (
    <div className="min-h-screen bg-[#030816] p-3 text-cyan-50 md:p-4">
      <div className="mx-auto flex w-full max-w-7xl rounded-[24px] border border-cyan-200/15 bg-[#050e21] shadow-[0_0_0_1px_rgba(125,211,252,0.05),0_24px_80px_-30px_rgba(0,0,0,0.8)]">
        <aside className="hidden w-[230px] shrink-0 border-r border-cyan-100/15 bg-gradient-to-b from-[#172544] to-[#071334] p-4 md:flex md:flex-col">
          <div className="text-2xl font-black tracking-tight text-emerald-400">BareUnity</div>
          <nav className="mt-5 space-y-2 text-base">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`block w-full rounded-xl px-3 py-2 text-left transition ${activeTab === tab ? "bg-gradient-to-r from-emerald-500/35 to-cyan-500/35 text-cyan-50" : "bg-[#1d2a4d]/55 text-cyan-100/80 hover:bg-[#24355f]/75"}`}
              >
                {tab}
              </button>
            ))}
          </nav>
          <Link href="/" className="mt-auto block rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-2 text-center text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300/25">
            ← Return Home
          </Link>
        </aside>

        <main className="min-w-0 flex-1 p-3 md:p-5">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm ${activeTab === tab ? "bg-cyan-300/25 text-cyan-50" : "border border-cyan-100/25 text-cyan-100/80"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <section className="relative overflow-hidden rounded-3xl border border-cyan-100/20 p-5" style={{ background: `linear-gradient(110deg, ${profilePrimary}66, #0e2a3f 50%, ${profileSecondary}99)` }}>
            <div className="flex items-end gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-[#081124] text-xl font-bold text-[#041222]" style={{ background: `linear-gradient(145deg, ${profilePrimary}, #1ee2bb)` }}>
                {profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  username.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-cyan-50">{username}</h1>
                <p className="text-sm text-cyan-100/70">Premium Member</p>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {statCards.map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-cyan-100/15 bg-[#08182f] p-4">
                <p className="text-2xl font-semibold leading-none text-cyan-100">{stat.value}</p>
                <p className="mt-1 text-sm text-cyan-100/80">{stat.label}</p>
              </article>
            ))}
          </section>

          <section className="mt-4 rounded-3xl border border-cyan-100/15 bg-[#08182f] p-4">
            {activeTab === "Overview" && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-cyan-100">Profile Overview</h2>
                <p className="text-sm text-cyan-100/70">Your profile activity at a glance.</p>
                {profilePosts.length === 0 ? (
                  <div className="rounded-2xl border border-cyan-100/15 bg-[#091629] p-4 text-sm text-cyan-100/70">No posts yet. Share your first story to populate your overview.</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {profilePosts.slice(0, 2).map((post) => (
                      <div key={post.id} className="rounded-2xl border border-cyan-100/15 bg-[#091629] p-4">
                        <p className="text-xs text-cyan-100/60">{new Date(post.created_at).toLocaleString()}</p>
                        {post.title && <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>}
                        {post.content && <p className="mt-2 text-sm text-cyan-100/85">{post.content}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "Posts" && (
              <div className="space-y-3">
                {profilePosts.length === 0 ? <p className="text-sm text-cyan-100/65">No posts yet.</p> : profilePosts.map((post) => (
                  <div key={post.id} className="rounded-2xl border border-cyan-100/15 bg-[#091629] p-4">
                    <p className="text-xs text-cyan-100/60">{new Date(post.created_at).toLocaleString()}</p>
                    {post.title && <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>}
                    {post.content && <p className="mt-2 text-sm text-cyan-100/85">{post.content}</p>}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "Comments" && (
              <div className="space-y-3">
                {profileComments.length === 0 ? (
                  <p className="text-sm text-cyan-100/65">{commentsTableMissing ? "Comments table is not available yet. Run the SQL migration below." : "No comments yet."}</p>
                ) : profileComments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-cyan-100/15 bg-[#091629] p-4">
                    <p className="text-xs text-cyan-100/60">{new Date(comment.created_at).toLocaleString()}</p>
                    <p className="mt-2 text-sm text-cyan-100/90">{comment.body ?? comment.content ?? "(empty comment)"}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "Gallery" && (
              <div>
                {mediaPosts.length === 0 ? (
                  <p className="text-sm text-cyan-100/65">No uploaded images yet.</p>
                ) : (
                  <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                    {mediaPosts.map((post) => (
                      <div key={post.id} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-cyan-100/15 bg-[#071225]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={post.media_url ?? ""} alt={post.title ?? "Gallery image"} className="w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "Upvoted" && (
              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Friends ({friends.length})</h3>
                  <ul className="mt-3 space-y-2 text-xs text-cyan-100/85">
                    {friends.map((friend) => (
                      <li key={friend.id} className="flex items-center justify-between rounded-lg border border-white/15 bg-[#091629] px-3 py-2"><span>u/{friend.username}</span><span className="capitalize text-cyan-100/60">{friend.status}</span></li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Pending friend requests</h3>
                  <div className="mt-3 space-y-2">
                    {friendRequests.length === 0 ? <p className="text-xs text-cyan-100/70">No pending requests.</p> : friendRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-white/15 bg-[#091629] p-3 text-xs text-cyan-100/85"><p className="font-semibold">u/{request.username}</p><p className="text-cyan-100/60">{request.mutualFriends} mutual friends</p></div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "Settings" && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-cyan-100">Settings</h2>

                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Media</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-cyan-100/70">
                      Profile picture URL
                      <input value={profileImageUrl} onChange={(event) => setProfileImageUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-[#091629] px-3 py-2 text-cyan-100" />
                    </label>
                    <label className="text-xs text-cyan-100/70">
                      Banner picture URL
                      <input value={bannerImageUrl} onChange={(event) => setBannerImageUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-[#091629] px-3 py-2 text-cyan-100" />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Profile content</h3>
                  <textarea
                    value={introduction}
                    onChange={(event) => setIntroduction(event.target.value.slice(0, 220))}
                    placeholder="Introduce yourself in a short sentence..."
                    className="mt-3 h-28 w-full resize-none rounded-xl border border-cyan-100/20 bg-[#091629] p-3 text-sm text-cyan-50 outline-none placeholder:text-cyan-100/50"
                  />
                </section>

                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Profile style</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs text-cyan-100/70">Primary<input type="color" value={profilePrimary} onChange={(event) => setProfilePrimary(event.target.value)} className="mt-1 h-9 w-full rounded border border-white/20 bg-transparent" /></label>
                    <label className="text-xs text-cyan-100/70">Secondary<input type="color" value={profileSecondary} onChange={(event) => setProfileSecondary(event.target.value)} className="mt-1 h-9 w-full rounded border border-white/20 bg-transparent" /></label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setFeedStyle("balanced")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "balanced" ? "bg-cyan-400 text-[#041222]" : "border border-white/20 text-cyan-100"}`}>Balanced</button>
                    <button type="button" onClick={() => setFeedStyle("magazine")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "magazine" ? "bg-cyan-400 text-[#041222]" : "border border-white/20 text-cyan-100"}`}>Magazine</button>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4 text-sm text-cyan-100/80">
                  <h3 className="text-sm font-semibold text-cyan-100">Privacy</h3>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
                  <h3 className="text-sm font-semibold text-cyan-100">Connections</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-semibold text-cyan-100/80">Pending requests</h4>
                      <div className="mt-2 space-y-2">
                        {friendRequests.length === 0 ? <p className="text-xs text-cyan-100/70">No pending requests.</p> : friendRequests.map((request) => (
                          <div key={request.id} className="rounded-xl border border-white/15 bg-[#091629] p-3 text-xs text-cyan-100/85">
                            <p className="font-semibold">u/{request.username}</p>
                            <p className="text-cyan-100/60">{request.mutualFriends} mutual friends</p>
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => acceptRequest(request)} className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white">Accept</button>
                              <button type="button" onClick={() => declineRequest(request.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px]">Decline</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-cyan-100/80">Friends ({friends.length})</h4>
                      <ul className="mt-2 space-y-2 text-xs text-cyan-100/85">
                        {friends.map((friend) => (
                          <li key={friend.id} className="flex items-center justify-between rounded-lg border border-white/15 bg-[#091629] px-3 py-2">
                            <span>u/{friend.username}</span>
                            <span className="capitalize text-cyan-100/60">{friend.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
