"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SidebarMenu from "@/components/SidebarMenu";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type TabKey = "Overview" | "Posts" | "Comments" | "Gallery" | "Upvoted" | "Settings";
type FeedStyle = "balanced" | "magazine";
type ThemePack = "minimal" | "nature" | "high-contrast";
type DashboardWidgetKey = "profile_card" | "goals" | "recent_activity";
type DashboardWidgets = Record<DashboardWidgetKey, boolean>;

const tabMap: Record<string, TabKey> = {
  overview: "Overview",
  posts: "Posts",
  comments: "Comments",
  gallery: "Gallery",
  upvoted: "Upvoted",
  settings: "Settings",
};

type MediaPost = { id: string; media_url: string | null; title: string | null; created_at: string };
type ProfilePost = { id: string; title: string | null; content: string | null; media_url: string | null; created_at: string };
type ProfileComment = { id: string; body: string | null; content: string | null; created_at: string };
type FriendStatus = "online" | "away" | "offline";
type Friend = { id: string; username: string; status: FriendStatus };
type FriendRequest = { id: string; username: string; mutualFriends: number };
type PrivacySettings = { showEmail: boolean; showActivity: boolean; allowFriendRequests: boolean };
type VerificationStatus = "none" | "requested" | "verified";
type FollowCategory = "close_friends" | "collaborators" | "inspiration";
type ImpactStats = { helpfulReplies: number; acceptedAnswers: number };
type SocialGraphMode = "follow" | "mutual_friend";

type ProfileSettingsRow = {
  profile_primary: string;
  profile_secondary: string;
  avatar_url: string | null;
  banner_url: string | null;
  show_email: boolean;
  show_activity: boolean;
  allow_friend_requests: boolean;
  feed_style: FeedStyle;
  friends: Friend[] | null;
  friend_requests: FriendRequest[] | null;
  introduction?: string | null;
  home_theme_pack?: ThemePack | null;
  dashboard_widgets?: DashboardWidgets | null;
  verification_status?: VerificationStatus | null;
  notable_contributor_note?: string | null;
  follow_categories?: FollowCategory[] | null;
  impact_stats?: ImpactStats | null;
  social_graph_mode?: SocialGraphMode | null;
  blocked_usernames?: string[] | null;
};

const defaultDashboardWidgets: DashboardWidgets = {
  profile_card: true,
  goals: true,
  recent_activity: true,
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
  homeThemePack: "nature" as ThemePack,
  dashboardWidgets: defaultDashboardWidgets,
  verificationStatus: "none" as VerificationStatus,
  notableContributorNote: "",
  followCategories: ["collaborators"] as FollowCategory[],
  impactStats: { helpfulReplies: 8, acceptedAnswers: 3 } as ImpactStats,
  socialGraphMode: "follow" as SocialGraphMode,
  blockedUsernames: [] as string[],
};

function uid() {
  return crypto.randomUUID();
}

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
  const searchParams = useSearchParams();
  const activeTab = tabMap[(searchParams.get("tab") ?? "").toLowerCase()] ?? "Overview";
  const [profilePrimary, setProfilePrimary] = useState(defaultSettings.profilePrimary);
  const [profileSecondary, setProfileSecondary] = useState(defaultSettings.profileSecondary);
  const [feedStyle, setFeedStyle] = useState<FeedStyle>(defaultSettings.feedStyle);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultSettings.privacy);
  const [friends, setFriends] = useState<Friend[]>(defaultSettings.friends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(defaultSettings.friendRequests);
  const [introduction, setIntroduction] = useState(defaultSettings.introduction);
  const [homeThemePack, setHomeThemePack] = useState<ThemePack>(defaultSettings.homeThemePack);
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgets>(defaultSettings.dashboardWidgets);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(defaultSettings.verificationStatus);
  const [notableContributorNote, setNotableContributorNote] = useState(defaultSettings.notableContributorNote);
  const [followCategories, setFollowCategories] = useState<FollowCategory[]>(defaultSettings.followCategories);
  const [impactStats, setImpactStats] = useState<ImpactStats>(defaultSettings.impactStats);
  const [socialGraphMode, setSocialGraphMode] = useState<SocialGraphMode>(defaultSettings.socialGraphMode);
  const [blockedUsernames, setBlockedUsernames] = useState<string[]>(defaultSettings.blockedUsernames);
  const [blockInput, setBlockInput] = useState("");
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

  const reputationScore = useMemo(() => {
    const participation = userPostsCount * 6 + impactStats.helpfulReplies * 4 + impactStats.acceptedAnswers * 8;
    return Math.max(0, Math.min(1000, participation));
  }, [impactStats.acceptedAnswers, impactStats.helpfulReplies, userPostsCount]);

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
        .select("profile_primary, profile_secondary, avatar_url, banner_url, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests, introduction, home_theme_pack, dashboard_widgets, verification_status, notable_contributor_note, follow_categories, impact_stats, social_graph_mode, blocked_usernames")
        .eq("user_id", user.id)
        .maybeSingle<ProfileSettingsRow>();

      if (query.error?.message?.includes("introduction") || query.error?.message?.includes("home_theme_pack") || query.error?.message?.includes("dashboard_widgets") || query.error?.message?.includes("verification_status") || query.error?.message?.includes("notable_contributor_note") || query.error?.message?.includes("follow_categories") || query.error?.message?.includes("impact_stats")) {
        query = await supabase
          .from("profile_settings")
          .select("profile_primary, profile_secondary, avatar_url, banner_url, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests, social_graph_mode, blocked_usernames")
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
            avatar_url: null,
            banner_url: null,
            show_email: defaultSettings.privacy.showEmail,
            show_activity: defaultSettings.privacy.showActivity,
            allow_friend_requests: defaultSettings.privacy.allowFriendRequests,
            feed_style: defaultSettings.feedStyle,
            friends: defaultSettings.friends,
            friend_requests: defaultSettings.friendRequests,
            introduction: defaultSettings.introduction,
            home_theme_pack: defaultSettings.homeThemePack,
            dashboard_widgets: defaultSettings.dashboardWidgets,
            verification_status: defaultSettings.verificationStatus,
            notable_contributor_note: defaultSettings.notableContributorNote,
            follow_categories: defaultSettings.followCategories,
            impact_stats: defaultSettings.impactStats,
            social_graph_mode: defaultSettings.socialGraphMode,
            blocked_usernames: defaultSettings.blockedUsernames,
          },
          { onConflict: "user_id" },
        );

        if (createError && !createError.message.includes("introduction") && !createError.message.includes("home_theme_pack") && !createError.message.includes("dashboard_widgets") && !createError.message.includes("verification_status") && !createError.message.includes("notable_contributor_note") && !createError.message.includes("follow_categories") && !createError.message.includes("impact_stats")) console.error(createError);
        setLoadedSettingsUserId(user.id);
        return;
      }

      setProfilePrimary(data.profile_primary ?? defaultSettings.profilePrimary);
      setProfileSecondary(data.profile_secondary ?? defaultSettings.profileSecondary);
      setFeedStyle(data.feed_style ?? defaultSettings.feedStyle);
      setProfileImageUrl(data.avatar_url ?? "");
      setBannerImageUrl(data.banner_url ?? "");
      setPrivacy({
        showEmail: data.show_email ?? defaultSettings.privacy.showEmail,
        showActivity: data.show_activity ?? defaultSettings.privacy.showActivity,
        allowFriendRequests: data.allow_friend_requests ?? defaultSettings.privacy.allowFriendRequests,
      });
      setFriends(data.friends ?? defaultSettings.friends);
      setFriendRequests(data.friend_requests ?? defaultSettings.friendRequests);
      setIntroduction(data.introduction ?? defaultSettings.introduction);
      setHomeThemePack(data.home_theme_pack ?? defaultSettings.homeThemePack);
      setDashboardWidgets({ ...defaultSettings.dashboardWidgets, ...(data.dashboard_widgets ?? {}) });
      setVerificationStatus(data.verification_status ?? defaultSettings.verificationStatus);
      setNotableContributorNote(data.notable_contributor_note ?? defaultSettings.notableContributorNote);
      setFollowCategories(data.follow_categories ?? defaultSettings.followCategories);
      setImpactStats({ ...defaultSettings.impactStats, ...(data.impact_stats ?? {}) });
      setSocialGraphMode(data.social_graph_mode ?? defaultSettings.socialGraphMode);
      setBlockedUsernames(data.blocked_usernames ?? defaultSettings.blockedUsernames);
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
        avatar_url: profileImageUrl || null,
        banner_url: bannerImageUrl || null,
        show_email: privacy.showEmail,
        show_activity: privacy.showActivity,
        allow_friend_requests: privacy.allowFriendRequests,
        feed_style: feedStyle,
        friends,
        friend_requests: friendRequests,
        introduction,
        home_theme_pack: homeThemePack,
        dashboard_widgets: dashboardWidgets,
        verification_status: verificationStatus,
        notable_contributor_note: notableContributorNote,
        follow_categories: followCategories,
        impact_stats: impactStats,
        social_graph_mode: socialGraphMode,
        blocked_usernames: blockedUsernames,
      };

      let { error } = await supabase.from("profile_settings").upsert(payload, { onConflict: "user_id" });

      if (error?.message?.includes("introduction") || error?.message?.includes("home_theme_pack") || error?.message?.includes("dashboard_widgets") || error?.message?.includes("verification_status") || error?.message?.includes("notable_contributor_note") || error?.message?.includes("follow_categories") || error?.message?.includes("impact_stats")) {
        const unsupportedColumns = ["introduction", "home_theme_pack", "dashboard_widgets", "verification_status", "notable_contributor_note", "follow_categories", "impact_stats", "social_graph_mode", "blocked_usernames"];
        const withoutUnsupported = Object.fromEntries(Object.entries(payload).filter(([key]) => !unsupportedColumns.includes(key)));
        error = (await supabase.from("profile_settings").upsert(withoutUnsupported, { onConflict: "user_id" })).error;
      }

      if (error) console.error(error);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [user?.id, loadedSettingsUserId, profilePrimary, profileSecondary, profileImageUrl, bannerImageUrl, feedStyle, privacy, friends, friendRequests, introduction, homeThemePack, dashboardWidgets, verificationStatus, notableContributorNote, followCategories, impactStats, socialGraphMode, blockedUsernames]);

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

  function updateDashboardWidget(widget: DashboardWidgetKey, checked: boolean) {
    setDashboardWidgets((current) => ({ ...current, [widget]: checked }));
  }
  
  async function handleImageUpload(file: File | null, target: "avatar" | "banner") {
    if (!file || !user?.id) return;

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${target}s/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error(uploadError);
      return;
    }

    const { data: publicImageData } = supabase.storage.from("media").getPublicUrl(filePath);
    const imageUrl = publicImageData.publicUrl;

    if (target === "avatar") setProfileImageUrl(imageUrl);
    if (target === "banner") setBannerImageUrl(imageUrl);

    if (target === "avatar") {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          username,
          avatar_url: imageUrl,
        },
        { onConflict: "id" },
      );

      if (profileError) console.error(profileError);
    }

    const nextMetadata = {
      ...(user.user_metadata ?? {}),
      [`${target}_url`]: imageUrl,
    };
    
    const { data: updatedUserData, error: metadataError } = await supabase.auth.updateUser({
      data: nextMetadata,
    });

    if (metadataError) {
      console.error(metadataError);
      return;
    }

    if (updatedUserData.user) setUser(updatedUserData.user);
  }

  function toggleFollowCategory(category: FollowCategory) {
    setFollowCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
  }

  function approveFriendRequest(requestId: string) {
    const request = friendRequests.find((entry) => entry.id === requestId);
    if (!request) return;

    setFriendRequests((current) => current.filter((entry) => entry.id !== requestId));
    setFriends((current) => [{ id: uid(), username: request.username, status: "online" }, ...current]);
  }

  function declineFriendRequest(requestId: string) {
    setFriendRequests((current) => current.filter((entry) => entry.id !== requestId));
  }

  function addBlockedUser() {
    const normalized = blockInput.trim().replace(/^@/, "").toLowerCase();
    if (!normalized) return;
    if (blockedUsernames.includes(normalized)) {
      setBlockInput("");
      return;
    }

    setBlockedUsernames((current) => [...current, normalized]);
    setBlockInput("");
  }

  function removeBlockedUser(usernameToRemove: string) {
    setBlockedUsernames((current) => current.filter((entry) => entry !== usernameToRemove));
  }

  const statCards = [
    { label: "Followers", value: followersCount.toLocaleString() },
    { label: "Following", value: followingCount.toLocaleString() },
    { label: "Posts", value: userPostsCount.toLocaleString() },
    { label: "Engagement", value: engagement },
    { label: "Badges", value: badgesCount.toLocaleString() },
    { label: "Reputation", value: reputationScore.toLocaleString() },
    { label: "Helpful replies", value: impactStats.helpfulReplies.toLocaleString() },
    { label: "Accepted answers", value: impactStats.acceptedAnswers.toLocaleString() },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.2),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.12),transparent_25%),#0a0b10] text-[#eef2ff]">
      <main className="min-h-screen p-3 sm:p-6">
        <div className="mx-auto grid min-h-[calc(100vh-24px)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border border-[#242941] bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-48px)] lg:grid-cols-[250px_1fr_320px]">
          <div className="border-b border-[#242941] p-3 lg:border-b-0 lg:border-r lg:p-4">
            <SidebarMenu />
          </div>

          <section className="order-1 overflow-hidden p-3.5 sm:p-5.5 lg:order-0">
            

            <section className="mb-4 overflow-hidden rounded-[18px] border border-[#242941] bg-[#121522]">
              {bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="Profile banner" className="h-32.5 w-full object-cover opacity-70 sm:h-37.5" />
              ) : (
                <div className="h-32.5 w-full bg-[linear-gradient(135deg,rgba(124,92,255,0.5),rgba(45,212,191,0.25))] sm:h-37.5" />
              )}
              <div className="-mt-7 flex items-end gap-3 p-3 sm:-mt-8 sm:p-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-[#1a1f33] bg-linear-to-br from-[#8d76ff] to-[#2dd4bf] text-lg font-semibold text-white sm:h-16 sm:w-16">
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold sm:text-2xl">{username}</h1>
                  <p className="text-xs text-[#8e97b8]">@{user?.email?.split("@")[0] ?? "naturist"}</p>
                  {introduction ? <p className="mt-1 text-sm text-[#dce2ff]">{introduction}</p> : null}
                </div>
              </div>
            </section>

            {activeTab === "Overview" && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statCards.map((stat) => <article key={stat.label} className="rounded-[18px] border border-[#242941] bg-[#121522] p-3.5"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-sm text-[#8e97b8]">{stat.label}</p></article>)}</section>}

            {activeTab === "Posts" && (
              <section className="grid max-h-155 grid-cols-1 gap-3 overflow-y-auto pr-1">
                {profilePosts.length === 0 ? <article className="rounded-[18px] border border-[#242941] bg-[#121522] p-3.5 text-sm text-[#8e97b8]">No posts yet.</article> : profilePosts.map((post) => (
                  <article key={post.id} className="rounded-[18px] border border-[#242941] bg-[#121522] p-3.5">
                    <div className="mb-2.5 flex items-start justify-between"><div><strong className="block text-sm">{post.title ?? "Untitled post"}</strong><span className="text-xs text-[#8e97b8]">{formatRelativeTime(post.created_at)}</span></div></div>
                    <p className="mb-2.5 text-[13px] text-[#dce2ff]">{post.content ?? "No post content yet."}</p>
                    {post.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.media_url} alt={post.title ?? "Post media"} className="h-32.5 w-full rounded-[14px] border border-[#2b3150] object-cover" />
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
                  <p className="mt-3 text-xs text-[#8e97b8]">Relationship model</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setSocialGraphMode("follow")} className={`rounded-full px-3 py-1 text-xs ${socialGraphMode === "follow" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>One-way follow</button>
                    <button type="button" onClick={() => setSocialGraphMode("mutual_friend")} className={`rounded-full px-3 py-1 text-xs ${socialGraphMode === "mutual_friend" ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>Mutual friend</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
                  </div>
                  <p className="mt-3 text-xs text-[#8e97b8]">Friends: {friends.length} · Pending requests: {friendRequests.length}</p>
                </article>

                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Friend requests</h3>
                  <p className="mt-2 text-xs text-[#8e97b8]">Approve or decline incoming requests.</p>
                  <div className="mt-3 space-y-2">
                    {friendRequests.length === 0 ? <p className="text-xs text-[#8e97b8]">No pending requests.</p> : friendRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-[#2b3150] bg-[#0d1020] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm text-[#dce2ff]">@{request.username}</p>
                            <p className="text-[11px] text-[#8e97b8]">{request.mutualFriends} mutual friends</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => approveFriendRequest(request.id)} className="rounded-full bg-accent px-2.5 py-1 text-[11px] text-[#08232c]">Approve</button>
                            <button type="button" onClick={() => declineFriendRequest(request.id)} className="rounded-full border border-[#46507d] px-2.5 py-1 text-[11px]">Decline</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Blocked accounts</h3>
                  <p className="mt-2 text-xs text-[#8e97b8]">Blocked users cannot interact with you.</p>
                  <div className="mt-3 flex gap-2">
                    <input value={blockInput} onChange={(event) => setBlockInput(event.target.value)} placeholder="username" className="w-full rounded-xl border border-[#2b3150] bg-[#0d1020] px-3 py-2" />
                    <button type="button" onClick={addBlockedUser} className="rounded-xl bg-accent px-3 py-2 text-xs text-[#08232c]">Block</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blockedUsernames.length === 0 ? <span className="text-xs text-[#8e97b8]">No blocked users.</span> : blockedUsernames.map((entry) => (
                      <button key={entry} type="button" onClick={() => removeBlockedUser(entry)} className="rounded-full border border-[#46507d] px-3 py-1 text-xs">
                        @{entry} ×
                      </button>
                    ))}
                  </div>
                </article>
                
                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Verification + reputation</h3>
                  <p className="mt-2 text-xs text-[#8e97b8]">Optional flow for notable contributors with public impact signals.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["none", "requested", "verified"] as VerificationStatus[]).map((status) => (
                      <button key={status} type="button" onClick={() => setVerificationStatus(status)} className={`rounded-full px-3 py-1 text-xs capitalize ${verificationStatus === status ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>
                        {status === "none" ? "Not verified" : status}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 block text-xs text-[#8e97b8]">Notable contributor note
                    <textarea value={notableContributorNote} onChange={(event) => setNotableContributorNote(event.target.value.slice(0, 220))} className="mt-1 h-20 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] p-2 text-sm text-[#dce2ff]" placeholder="Highlight why verification should be reviewed" />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-xs text-[#8e97b8]">Helpful replies
                      <input type="number" min={0} value={impactStats.helpfulReplies} onChange={(event) => setImpactStats((current) => ({ ...current, helpfulReplies: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-[#8e97b8]">Accepted answers
                      <input type="number" min={0} value={impactStats.acceptedAnswers} onChange={(event) => setImpactStats((current) => ({ ...current, acceptedAnswers: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-[#2b3150] bg-[#0d1020] px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-[#8e97b8]">Reputation score: <span className="font-semibold text-[#dce2ff]">{reputationScore}</span> based on healthy participation.</p>
                </article>

                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Follow categories</h3>
                  <p className="mt-2 text-xs text-[#8e97b8]">Organize people you follow into close friends, collaborators, and inspiration lists.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["close_friends", "collaborators", "inspiration"] as FollowCategory[]).map((category) => (
                      <button key={category} type="button" onClick={() => toggleFollowCategory(category)} className={`rounded-full px-3 py-1 text-xs capitalize ${followCategories.includes(category) ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>
                        {category.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-[#242941] bg-[#121522] p-4 text-sm">
                  <h3 className="font-semibold text-[#2dd4bf]">Home dashboard</h3>
                  <p className="mt-2 text-xs text-[#8e97b8]">Choose a theme pack and pick which widgets are visible on the home dashboard.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["minimal", "nature", "high-contrast"] as ThemePack[]).map((pack) => (
                      <button key={pack} type="button" onClick={() => setHomeThemePack(pack)} className={`rounded-full px-3 py-1 text-xs capitalize ${homeThemePack === pack ? "bg-accent text-[#08232c]" : "border border-accent/30"}`}>
                        {pack}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center justify-between">Profile card<input type="checkbox" checked={dashboardWidgets.profile_card} onChange={(event) => updateDashboardWidget("profile_card", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Goals this week<input type="checkbox" checked={dashboardWidgets.goals} onChange={(event) => updateDashboardWidget("goals", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Recent activity<input type="checkbox" checked={dashboardWidgets.recent_activity} onChange={(event) => updateDashboardWidget("recent_activity", event.target.checked)} /></label>
                  </div>
                </article>
              </section>
            )}
          </section>

          <aside className="order-2 border-t border-[#242941] bg-[rgba(9,11,19,0.66)] p-[18px_14px] sm:p-[22px_18px] lg:order-0 lg:border-l lg:border-t-0">
            <div className="mb-4.5 rounded-[14px] border border-[#242941] bg-[#121522] px-3 pb-3 pt-4.5 text-center">
              <div className="mx-auto mb-2.5 flex h-16.5 w-16.5 items-center justify-center overflow-hidden rounded-full border-2 border-[rgba(124,92,255,0.45)] bg-linear-to-br from-[#7c5cff] to-[#2dd4bf]">
                {profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{username.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <strong>{username}</strong>
              <div className="mt-0.5 text-xs text-[#8e97b8]">@{user?.email?.split("@")[0] ?? "naturist"}</div>
              <div className="mt-2 text-[11px] text-[#8e97b8]">Verification: <span className="capitalize text-[#dce2ff]">{verificationStatus === "none" ? "Not verified" : verificationStatus}</span></div>
              <div className="mt-1 text-[11px] text-[#8e97b8]">Impact: {impactStats.helpfulReplies} helpful replies · {impactStats.acceptedAnswers} accepted answers</div>
              <div className="mt-3.5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2"><strong className="block text-[13px]">{followersCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Followers</span></div>
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2"><strong className="block text-[13px]">{followingCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Following</span></div>
                <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2"><strong className="block text-[13px]">{userPostsCount.toLocaleString()}</strong><span className="text-[10px] text-[#8e97b8]">Posts</span></div>
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
