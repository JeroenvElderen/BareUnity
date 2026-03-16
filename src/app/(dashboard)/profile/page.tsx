"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { PROFILE_INTERESTS, USER_ROLES, isPlatformAdmin, type ProfileInterest, type UserRole } from "@/lib/onboarding";
import { sanitizeImageUpload } from "@/lib/image";
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
type SectionVisibility = "public" | "followers_only" | "private";
type ProfileSectionKey = "about" | "links" | "milestones" | "skills" | "portfolio" | "timeline";
type ProfileSectionVisibility = Record<ProfileSectionKey, SectionVisibility>;
type ProfileSections = Record<"about" | "links" | "milestones" | "skills", boolean>;
type IdentityBadge = "founder" | "moderator" | "top_contributor" | "local_ambassador";

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
  custom_profile_url?: string | null;
  vanity_slug?: string | null;
  pronouns?: string | null;
  communication_preferences?: string[] | null;
  profile_sections?: ProfileSections | null;
  section_visibility?: ProfileSectionVisibility | null;
  featured_post_ids?: string[] | null;
  identity_badges?: IdentityBadge[] | null;
  timeline_highlights?: string[] | null;
  user_role?: UserRole | null;
  interests?: ProfileInterest[] | null;
  onboarding_completed?: boolean | null;
};

const defaultDashboardWidgets: DashboardWidgets = {
  profile_card: true,
  goals: true,
  recent_activity: true,
};

const defaultSections: ProfileSections = {
  about: true,
  links: true,
  milestones: true,
  skills: true,
};

const defaultSectionVisibility: ProfileSectionVisibility = {
  about: "public",
  links: "public",
  milestones: "followers_only",
  skills: "public",
  portfolio: "public",
  timeline: "followers_only",
};

const defaultSettings = {
  profilePrimary: "#1fd8b5",
  profileSecondary: "#112b44",
  feedStyle: "balanced" as FeedStyle,
  privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
  friends: [] as Friend[],
  friendRequests: [] as FriendRequest[],
  introduction: "",
  homeThemePack: "nature" as ThemePack,
  dashboardWidgets: defaultDashboardWidgets,
  verificationStatus: "none" as VerificationStatus,
  notableContributorNote: "",
  followCategories: ["collaborators"] as FollowCategory[],
  impactStats: { helpfulReplies: 0, acceptedAnswers: 0 } as ImpactStats,
  socialGraphMode: "follow" as SocialGraphMode,
  blockedUsernames: [] as string[],
  customProfileUrl: "",
  vanitySlug: "",
  pronouns: "",
  communicationPreferences: ["Direct messages"],
  profileSections: defaultSections,
  sectionVisibility: defaultSectionVisibility,
  featuredPostIds: [] as string[],
  identityBadges: [] as IdentityBadge[],
  timelineHighlights: [] as string[],
  userRole: "newcomer" as UserRole,
  interests: [] as ProfileInterest[],
  onboardingCompleted: false,
};

function normalizeVanitySlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

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
  const [customProfileUrl, setCustomProfileUrl] = useState(defaultSettings.customProfileUrl);
  const [vanitySlug, setVanitySlug] = useState(defaultSettings.vanitySlug);
  const [pronouns, setPronouns] = useState(defaultSettings.pronouns);
  const [communicationPreferences, setCommunicationPreferences] = useState<string[]>(defaultSettings.communicationPreferences);
  const [profileSections, setProfileSections] = useState<ProfileSections>(defaultSettings.profileSections);
  const [sectionVisibility, setSectionVisibility] = useState<ProfileSectionVisibility>(defaultSettings.sectionVisibility);
  const [featuredPostIds, setFeaturedPostIds] = useState<string[]>(defaultSettings.featuredPostIds);
  const [identityBadges, setIdentityBadges] = useState<IdentityBadge[]>(defaultSettings.identityBadges);
  const [timelineHighlights, setTimelineHighlights] = useState<string[]>(defaultSettings.timelineHighlights);
  const [userRole, setUserRole] = useState<UserRole>(defaultSettings.userRole);
  const [interests, setInterests] = useState<ProfileInterest[]>(defaultSettings.interests);
  const [onboardingCompleted, setOnboardingCompleted] = useState(defaultSettings.onboardingCompleted);
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
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const username = useMemo(() => {
    if (!user) return "Guest";
    return profileUsername || user.user_metadata?.username || user.email?.split("@")[0] || "Naturist";
  }, [profileUsername, user]);

  const isAdmin = isPlatformAdmin(user?.email);

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

      const { data: profileData } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle<{ username: string }>();
      setProfileUsername(profileData?.username ?? null);

      let query = await supabase
        .from("profile_settings")
        .select("profile_primary, profile_secondary, avatar_url, banner_url, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests, introduction, home_theme_pack, dashboard_widgets, verification_status, notable_contributor_note, follow_categories, impact_stats, social_graph_mode, blocked_usernames, custom_profile_url, vanity_slug, pronouns, communication_preferences, profile_sections, section_visibility, featured_post_ids, identity_badges, timeline_highlights, user_role, interests, onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle<ProfileSettingsRow>();

      if (query.error?.message?.includes("introduction") || query.error?.message?.includes("home_theme_pack") || query.error?.message?.includes("dashboard_widgets") || query.error?.message?.includes("verification_status") || query.error?.message?.includes("notable_contributor_note") || query.error?.message?.includes("follow_categories") || query.error?.message?.includes("impact_stats") || query.error?.message?.includes("custom_profile_url") || query.error?.message?.includes("vanity_slug") || query.error?.message?.includes("pronouns") || query.error?.message?.includes("communication_preferences") || query.error?.message?.includes("profile_sections") || query.error?.message?.includes("section_visibility") || query.error?.message?.includes("featured_post_ids") || query.error?.message?.includes("identity_badges") || query.error?.message?.includes("timeline_highlights") || query.error?.message?.includes("user_role") || query.error?.message?.includes("interests") || query.error?.message?.includes("onboarding_completed")) {
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
            custom_profile_url: defaultSettings.customProfileUrl,
            vanity_slug: defaultSettings.vanitySlug,
            pronouns: defaultSettings.pronouns,
            communication_preferences: defaultSettings.communicationPreferences,
            profile_sections: defaultSettings.profileSections,
            section_visibility: defaultSettings.sectionVisibility,
            featured_post_ids: defaultSettings.featuredPostIds,
            identity_badges: defaultSettings.identityBadges,
            timeline_highlights: defaultSettings.timelineHighlights,
            user_role: defaultSettings.userRole,
            interests: defaultSettings.interests,
            onboarding_completed: defaultSettings.onboardingCompleted,
          },
          { onConflict: "user_id" },
        );

        if (createError && !createError.message.includes("introduction") && !createError.message.includes("home_theme_pack") && !createError.message.includes("dashboard_widgets") && !createError.message.includes("verification_status") && !createError.message.includes("notable_contributor_note") && !createError.message.includes("follow_categories") && !createError.message.includes("impact_stats") && !createError.message.includes("custom_profile_url") && !createError.message.includes("vanity_slug") && !createError.message.includes("pronouns") && !createError.message.includes("communication_preferences") && !createError.message.includes("profile_sections") && !createError.message.includes("section_visibility") && !createError.message.includes("featured_post_ids") && !createError.message.includes("identity_badges") && !createError.message.includes("timeline_highlights") && !createError.message.includes("user_role") && !createError.message.includes("interests") && !createError.message.includes("onboarding_completed")) console.error(createError);
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
      setCustomProfileUrl(data.custom_profile_url ?? defaultSettings.customProfileUrl);
      setVanitySlug(data.vanity_slug ?? defaultSettings.vanitySlug);
      setPronouns(data.pronouns ?? defaultSettings.pronouns);
      setCommunicationPreferences(data.communication_preferences ?? defaultSettings.communicationPreferences);
      setProfileSections({ ...defaultSettings.profileSections, ...(data.profile_sections ?? {}) });
      setSectionVisibility({ ...defaultSettings.sectionVisibility, ...(data.section_visibility ?? {}) });
      setFeaturedPostIds(data.featured_post_ids ?? defaultSettings.featuredPostIds);
      setIdentityBadges(data.identity_badges ?? defaultSettings.identityBadges);
      setTimelineHighlights(data.timeline_highlights ?? defaultSettings.timelineHighlights);
      setUserRole(data.user_role ?? defaultSettings.userRole);
      setInterests(data.interests ?? defaultSettings.interests);
      setOnboardingCompleted(data.onboarding_completed ?? true);
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
        custom_profile_url: customProfileUrl || null,
        vanity_slug: vanitySlug || null,
        pronouns: pronouns || null,
        communication_preferences: communicationPreferences,
        profile_sections: profileSections,
        section_visibility: sectionVisibility,
        featured_post_ids: featuredPostIds,
        identity_badges: identityBadges,
        timeline_highlights: timelineHighlights,
        user_role: userRole,
        interests: interests,
        onboarding_completed: onboardingCompleted,
      };

      let { error } = await supabase.from("profile_settings").upsert(payload, { onConflict: "user_id" });

      if (error?.message?.includes("introduction") || error?.message?.includes("home_theme_pack") || error?.message?.includes("dashboard_widgets") || error?.message?.includes("verification_status") || error?.message?.includes("notable_contributor_note") || error?.message?.includes("follow_categories") || error?.message?.includes("impact_stats") || error?.message?.includes("custom_profile_url") || error?.message?.includes("vanity_slug") || error?.message?.includes("pronouns") || error?.message?.includes("communication_preferences") || error?.message?.includes("profile_sections") || error?.message?.includes("section_visibility") || error?.message?.includes("featured_post_ids") || error?.message?.includes("identity_badges") || error?.message?.includes("timeline_highlights") || error?.message?.includes("user_role") || error?.message?.includes("interests") || error?.message?.includes("onboarding_completed")) {
        const unsupportedColumns = ["introduction", "home_theme_pack", "dashboard_widgets", "verification_status", "notable_contributor_note", "follow_categories", "impact_stats", "social_graph_mode", "blocked_usernames", "custom_profile_url", "vanity_slug", "pronouns", "communication_preferences", "profile_sections", "section_visibility", "featured_post_ids", "identity_badges", "timeline_highlights", "user_role", "interests", "onboarding_completed"];
        const withoutUnsupported = Object.fromEntries(Object.entries(payload).filter(([key]) => !unsupportedColumns.includes(key)));
        error = (await supabase.from("profile_settings").upsert(withoutUnsupported, { onConflict: "user_id" })).error;
      }

      if (error) console.error(error);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [user?.id, loadedSettingsUserId, profilePrimary, profileSecondary, profileImageUrl, bannerImageUrl, feedStyle, privacy, friends, friendRequests, introduction, homeThemePack, dashboardWidgets, verificationStatus, notableContributorNote, followCategories, impactStats, socialGraphMode, blockedUsernames, customProfileUrl, vanitySlug, pronouns, communicationPreferences, profileSections, sectionVisibility, featuredPostIds, identityBadges, timelineHighlights, userRole, interests, onboardingCompleted]);

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

    const sanitizedFile = await sanitizeImageUpload(file, target === "avatar" ? 800 : 1920);
    const filePath = `${target}s/${user.id}/${crypto.randomUUID()}-${sanitizedFile.name}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(filePath, sanitizedFile, { upsert: true });

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

  function toggleInterest(interest: ProfileInterest) {
    setInterests((current) => current.includes(interest) ? current.filter((value) => value !== interest) : [...current, interest]);
  }

  function updateRole(nextRole: UserRole) {
    if (!isAdmin && nextRole !== "newcomer") return;
    setUserRole(nextRole);
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

  function toggleCommunicationPreference(preference: string) {
    setCommunicationPreferences((current) => current.includes(preference) ? current.filter((value) => value !== preference) : [...current, preference]);
  }

  function toggleProfileSection(section: keyof ProfileSections) {
    setProfileSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function setSectionAccess(section: ProfileSectionKey, visibility: SectionVisibility) {
    setSectionVisibility((current) => ({ ...current, [section]: visibility }));
  }

  function toggleIdentityBadge(badge: IdentityBadge) {
    setIdentityBadges((current) => current.includes(badge) ? current.filter((value) => value !== badge) : [...current, badge]);
  }

  function toggleFeaturedPost(postId: string) {
    setFeaturedPostIds((current) => current.includes(postId) ? current.filter((value) => value !== postId) : [...current, postId]);
  }

  function updateTimelineHighlight(index: number, value: string) {
    setTimelineHighlights((current) => current.map((entry, entryIndex) => (entryIndex === index ? value.slice(0, 90) : entry)));
  }

  function addTimelineHighlight() {
    setTimelineHighlights((current) => [...current, ""]);
  }

  function removeTimelineHighlight(index: number) {
    setTimelineHighlights((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }


  const completionChecks = [
    introduction.trim().length > 0,
    pronouns.trim().length > 0,
    customProfileUrl.trim().length > 0 || vanitySlug.trim().length > 0,
    communicationPreferences.length > 0,
    identityBadges.length > 0,
    timelineHighlights.some((entry) => entry.trim().length > 0),
    profileSections.about || profileSections.links || profileSections.milestones || profileSections.skills,
  ];

  const profileCompletionScore = Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100);

  const guidedActions = [
    !introduction.trim() ? "Add an about summary" : null,
    !pronouns.trim() ? "Set pronouns" : null,
    !customProfileUrl.trim() && !vanitySlug.trim() ? "Choose a profile URL or vanity slug" : null,
    communicationPreferences.length === 0 ? "Select communication preferences" : null,
    identityBadges.length === 0 ? "Add at least one identity badge" : null,
    !timelineHighlights.some((entry) => entry.trim()) ? "Add a timeline highlight" : null,
  ].filter((entry): entry is string => Boolean(entry));

  const featuredPosts = profilePosts.filter((post) => featuredPostIds.includes(post.id));
  const effectiveProfileUrl = customProfileUrl.trim() || (vanitySlug.trim() ? `/u/${vanitySlug.trim()}` : `/profile/${username.toLowerCase()}`);

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
    <section className="p-3 sm:p-6">
      <div className="grid min-h-full w-full grid-cols-1 rounded-[26px] border border-accent/20 bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1fr_320px] lg:overflow-hidden">
        <section className="order-1 p-3.5 sm:p-5.5 lg:order-0 lg:overflow-hidden">
            

            <section className="mb-4 overflow-hidden rounded-[18px] border border-accent/20 bg-card/90">
              {bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerImageUrl} alt="Profile banner" className="h-32.5 w-full object-cover opacity-70 sm:h-37.5" />
              ) : (
                <div className="h-32.5 w-full bg-[linear-gradient(135deg,rgb(var(--brand)/0.5),rgb(var(--accent)/0.26))] sm:h-37.5" />
              )}
              <div className="-mt-7 flex flex-col items-start gap-3 p-3 sm:-mt-8 sm:flex-row sm:items-end sm:p-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-accent/35 bg-linear-to-br from-brand to-brand-2 text-lg font-semibold text-text sm:h-16 sm:w-16">
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold sm:text-2xl">{username}</h1>
                  <p className="text-xs text-muted">@{user?.email?.split("@")[0] ?? "naturist"}</p>
                  {introduction ? <p className="mt-1 text-sm text-text">{introduction}</p> : null}
                  {pronouns ? <p className="mt-1 text-xs text-muted">Pronouns: {pronouns}</p> : null}
                  <p className="mt-1 text-xs text-muted">Profile URL: {effectiveProfileUrl}</p>
                  {identityBadges.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{identityBadges.map((badge) => <span key={badge} className="rounded-full border border-accent/35 px-2 py-0.5 text-[10px] uppercase tracking-wide">{badge.replaceAll("_", " ")}</span>)}</div> : null}
                </div>
              </div>
            </section>

            {activeTab === "Overview" && (
              <>
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statCards.map((stat) => <article key={stat.label} className="rounded-[18px] border border-accent/20 bg-card/90 p-3.5"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-sm text-muted">{stat.label}</p></article>)}</section>
                <section className="mt-4 grid gap-3 lg:grid-cols-2">
                  <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                    <h3 className="font-semibold text-accent">Creator portfolio</h3>
                    <p className="mt-2 text-xs text-muted">Featured posts curated from your published content.</p>
                    <div className="mt-3 space-y-2">
                      {featuredPosts.length === 0 ? <p className="text-xs text-muted">No featured posts selected.</p> : featuredPosts.map((post) => (
                        <div key={post.id} className="rounded-xl border border-accent/20 bg-bg-deep/70 p-2.5">
                          <p className="text-sm font-medium text-text">{post.title ?? "Untitled post"}</p>
                          <p className="text-[11px] text-muted">{formatRelativeTime(post.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                    <h3 className="font-semibold text-accent">Profile timeline</h3>
                    <p className="mt-2 text-xs text-muted">Life-cycle highlights visible based on your section access rules.</p>
                    <ol className="mt-3 space-y-2 list-decimal list-inside">
                      {timelineHighlights.filter((entry) => entry.trim()).length === 0 ? <li className="text-xs text-muted">No highlights yet.</li> : timelineHighlights.filter((entry) => entry.trim()).map((entry, index) => <li key={`${entry}-${index}`} className="text-xs text-text">{entry}</li>)}
                    </ol>
                  </article>
                </section>
              </>
            )}

            {activeTab === "Posts" && (
              <section className="grid grid-cols-1 gap-3 pr-1 lg:max-h-155 lg:overflow-y-auto">
                {profilePosts.length === 0 ? <article className="rounded-[18px] border border-accent/20 bg-card/90 p-3.5 text-sm text-muted">No posts yet.</article> : profilePosts.map((post) => (
                  <article key={post.id} className="rounded-[18px] border border-accent/20 bg-card/90 p-3.5">
                    <div className="mb-2.5 flex items-start justify-between"><div><strong className="block text-sm">{post.title ?? "Untitled post"}</strong><span className="text-xs text-muted">{formatRelativeTime(post.created_at)}</span></div></div>
                    <p className="mb-2.5 text-[13px] text-text">{post.content ?? "No post content yet."}</p>
                    {post.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.media_url} alt={post.title ?? "Post media"} className="h-32.5 w-full rounded-[14px] border border-accent/20 object-cover" />
                    ) : null}
                  </article>
                ))}
              </section>
            )}

            {activeTab === "Comments" && <section className="space-y-2 text-sm">{commentsTableMissing ? <p className="text-muted">Comments table not available in this environment.</p> : null}{!commentsTableMissing && profileComments.length === 0 ? <p className="text-muted">No comments yet.</p> : null}{profileComments.map((comment) => <article key={comment.id} className="rounded-xl border border-accent/20 bg-card/90 p-3"><p className="text-xs text-muted">{formatRelativeTime(comment.created_at)}</p><p className="mt-1 text-text">{comment.body ?? comment.content}</p></article>)}</section>}

            {activeTab === "Gallery" && (
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mediaPosts.length === 0 ? <p className="text-sm text-muted">No media posts yet.</p> : mediaPosts.map((post) => (
                  <article key={post.id} className="overflow-hidden rounded-2xl border border-accent/20 bg-card/90">
                    {post.media_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.media_url} alt={post.title ?? "Gallery image"} className="h-44 w-full object-cover" />
                    ) : null}
                    <div className="p-3 text-sm">{post.title ?? "Untitled"}</div>
                  </article>
                ))}
              </section>
            )}

            {activeTab === "Upvoted" && <p className="text-sm text-muted">Upvoted content will appear here once vote tracking is enabled.</p>}

            {activeTab === "Settings" && (
              <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Profile basics</h3>
                  <textarea value={introduction} onChange={(event) => setIntroduction(event.target.value.slice(0, 220))} className="mt-3 h-24 w-full rounded-xl border border-accent/20 bg-bg-deep/70 p-3" placeholder="Short introduction" />
                  <label className="mt-3 block">Profile image URL<input value={profileImageUrl} onChange={(event) => setProfileImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" /></label>
                  <label className="mt-3 block">Banner image URL<input value={bannerImageUrl} onChange={(event) => setBannerImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" /></label>
                </article>
                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Profile identity + URL</h3>
                  <label className="mt-3 block">Custom profile URL<input value={customProfileUrl} onChange={(event) => setCustomProfileUrl(event.target.value.slice(0, 120))} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" placeholder="https://bareunity.app/your-profile" /></label>
                  <label className="mt-3 block">Vanity slug<input value={vanitySlug} onChange={(event) => setVanitySlug(normalizeVanitySlug(event.target.value))} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" placeholder="your-name" /></label>
                  <label className="mt-3 block">Pronouns<input value={pronouns} onChange={(event) => setPronouns(event.target.value.slice(0, 40))} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" placeholder="they/them" /></label>
                  <p className="mt-3 text-xs text-muted">Communication preferences</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["Direct messages", "Email", "Mentions only", "Async only"].map((preference) => (
                      <button key={preference} type="button" onClick={() => toggleCommunicationPreference(preference)} className={`rounded-full px-3 py-1 text-xs ${communicationPreferences.includes(preference) ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                        {preference}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Onboarding role + interests</h3>
                  <p className="mt-2 text-xs text-muted">Role defaults to newcomer. Only the admin account can assign elevated roles.</p>
                  <p className="mt-2 text-[11px] text-muted">Onboarding completed: {onboardingCompleted ? "Yes" : "No"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {USER_ROLES.map((roleOption) => {
                      const disabled = !isAdmin && roleOption !== "newcomer";
                      return (
                        <button
                          key={roleOption}
                          type="button"
                          disabled={disabled}
                          onClick={() => updateRole(roleOption)}
                          className={`rounded-full px-3 py-1 text-xs capitalize ${userRole === roleOption ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          {roleOption.replace("_", " ")}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-muted">Interests</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PROFILE_INTERESTS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleInterest(interest)}
                        className={`rounded-full px-3 py-1 text-xs capitalize ${interests.includes(interest) ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Profile completeness</h3>
                  <p className="mt-2 text-xs text-muted">Completion score updates as you configure your profile.</p>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-bg-deep/70"><div className="h-full rounded-full bg-accent" style={{ width: `${profileCompletionScore}%` }} /></div>
                  <p className="mt-2 text-xs text-text">{profileCompletionScore}% complete</p>
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {guidedActions.length === 0 ? <li>All guided actions complete.</li> : guidedActions.map((action) => <li key={action}>• {action}</li>)}
                  </ul>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Custom profile sections</h3>
                  <p className="mt-2 text-xs text-muted">Toggle sections and choose visibility: public, followers-only, or private.</p>
                  <div className="mt-3 space-y-3">
                    {(["about", "links", "milestones", "skills"] as (keyof ProfileSections)[]).map((section) => (
                      <div key={section} className="rounded-xl border border-accent/20 bg-bg-deep/70 p-2.5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs capitalize"><input type="checkbox" checked={profileSections[section]} onChange={() => toggleProfileSection(section)} />{section}</label>
                          <span className="text-[11px] text-muted">{sectionVisibility[section]}</span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {(["public", "followers_only", "private"] as SectionVisibility[]).map((visibility) => (
                            <button key={visibility} type="button" onClick={() => setSectionAccess(section, visibility)} className={`rounded-full px-2 py-1 text-[11px] ${sectionVisibility[section] === visibility ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                              {visibility.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(["portfolio", "timeline"] as const).map((section) => (
                      <div key={section} className="rounded-xl border border-accent/20 bg-bg-deep/70 p-2.5">
                        <p className="text-xs capitalize">{section}</p>
                        <div className="mt-2 flex gap-1.5">
                          {(["public", "followers_only", "private"] as SectionVisibility[]).map((visibility) => (
                            <button key={visibility} type="button" onClick={() => setSectionAccess(section, visibility)} className={`rounded-full px-2 py-1 text-[11px] ${sectionVisibility[section] === visibility ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                              {visibility.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Identity badges + timeline</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["founder", "moderator", "top_contributor", "local_ambassador"] as IdentityBadge[]).map((badge) => (
                      <button key={badge} type="button" onClick={() => toggleIdentityBadge(badge)} className={`rounded-full px-3 py-1 text-xs capitalize ${identityBadges.includes(badge) ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                        {badge.replaceAll("_", " ")}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">Life-cycle highlights</p>
                  <div className="mt-2 space-y-2">
                    {timelineHighlights.map((highlight, index) => (
                      <div key={`timeline-${index}`} className="flex gap-2">
                        <input value={highlight} onChange={(event) => updateTimelineHighlight(index, event.target.value)} className="w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-1.5 text-xs" placeholder="Launched first community challenge" />
                        <button type="button" onClick={() => removeTimelineHighlight(index)} className="rounded-xl border border-accent/35 px-2 text-xs">×</button>
                      </div>
                    ))}
                    <button type="button" onClick={addTimelineHighlight} className="accent-fill-soft rounded-xl px-3 py-1 text-xs">Add highlight</button>
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Creator portfolio featured posts</h3>
                  <p className="mt-2 text-xs text-muted">Pick posts to feature in your portfolio section.</p>
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                    {profilePosts.length === 0 ? <p className="text-xs text-muted">Publish posts to feature them.</p> : profilePosts.map((post) => (
                      <label key={post.id} className="flex items-center justify-between gap-2 rounded-xl border border-accent/20 bg-bg-deep/70 px-2.5 py-2 text-xs">
                        <span className="truncate">{post.title ?? "Untitled post"}</span>
                        <input type="checkbox" checked={featuredPostIds.includes(post.id)} onChange={() => toggleFeaturedPost(post.id)} />
                      </label>
                    ))}
                  </div>
                </article>
                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Experience + privacy</h3>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setFeedStyle("balanced")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "balanced" ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>Balanced</button>
                    <button type="button" onClick={() => setFeedStyle("magazine")} className={`rounded-full px-3 py-1 text-xs ${feedStyle === "magazine" ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>Magazine</button>
                  </div>
                  <p className="mt-3 text-xs text-muted">Relationship model</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setSocialGraphMode("follow")} className={`rounded-full px-3 py-1 text-xs ${socialGraphMode === "follow" ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>One-way follow</button>
                    <button type="button" onClick={() => setSocialGraphMode("mutual_friend")} className={`rounded-full px-3 py-1 text-xs ${socialGraphMode === "mutual_friend" ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>Mutual friend</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
                    <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
                  </div>
                  <p className="mt-3 text-xs text-muted">Friends: {friends.length} · Pending requests: {friendRequests.length}</p>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Friend requests</h3>
                  <p className="mt-2 text-xs text-muted">Approve or decline incoming requests.</p>
                  <div className="mt-3 space-y-2">
                    {friendRequests.length === 0 ? <p className="text-xs text-muted">No pending requests.</p> : friendRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-accent/20 bg-bg-deep/70 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm text-text">@{request.username}</p>
                            <p className="text-[11px] text-muted">{request.mutualFriends} mutual friends</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => approveFriendRequest(request.id)} className="rounded-full bg-accent px-2.5 py-1 text-[11px] text-[rgb(var(--accent-contrast))]">Approve</button>
                            <button type="button" onClick={() => declineFriendRequest(request.id)} className="rounded-full border border-accent/35 px-2.5 py-1 text-[11px]">Decline</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Blocked accounts</h3>
                  <p className="mt-2 text-xs text-muted">Blocked users cannot interact with you.</p>
                  <div className="mt-3 flex gap-2">
                    <input value={blockInput} onChange={(event) => setBlockInput(event.target.value)} placeholder="username" className="w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-3 py-2" />
                    <button type="button" onClick={addBlockedUser} className="rounded-xl bg-accent px-3 py-2 text-xs text-[rgb(var(--accent-contrast))]">Block</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blockedUsernames.length === 0 ? <span className="text-xs text-muted">No blocked users.</span> : blockedUsernames.map((entry) => (
                      <button key={entry} type="button" onClick={() => removeBlockedUser(entry)} className="rounded-full border border-accent/35 px-3 py-1 text-xs">
                        @{entry} ×
                      </button>
                    ))}
                  </div>
                </article>
                
                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Verification + reputation</h3>
                  <p className="mt-2 text-xs text-muted">Optional flow for notable contributors with public impact signals.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["none", "requested", "verified"] as VerificationStatus[]).map((status) => (
                      <button key={status} type="button" onClick={() => setVerificationStatus(status)} className={`rounded-full px-3 py-1 text-xs capitalize ${verificationStatus === status ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                        {status === "none" ? "Not verified" : status}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 block text-xs text-muted">Notable contributor note
                    <textarea value={notableContributorNote} onChange={(event) => setNotableContributorNote(event.target.value.slice(0, 220))} className="mt-1 h-20 w-full rounded-xl border border-accent/20 bg-bg-deep/70 p-2 text-sm text-text" placeholder="Highlight why verification should be reviewed" />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted">Helpful replies
                      <input type="number" min={0} value={impactStats.helpfulReplies} onChange={(event) => setImpactStats((current) => ({ ...current, helpfulReplies: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-muted">Accepted answers
                      <input type="number" min={0} value={impactStats.acceptedAnswers} onChange={(event) => setImpactStats((current) => ({ ...current, acceptedAnswers: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 w-full rounded-xl border border-accent/20 bg-bg-deep/70 px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-muted">Reputation score: <span className="font-semibold text-text">{reputationScore}</span> based on healthy participation.</p>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Follow categories</h3>
                  <p className="mt-2 text-xs text-muted">Organize people you follow into close friends, collaborators, and inspiration lists.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["close_friends", "collaborators", "inspiration"] as FollowCategory[]).map((category) => (
                      <button key={category} type="button" onClick={() => toggleFollowCategory(category)} className={`rounded-full px-3 py-1 text-xs capitalize ${followCategories.includes(category) ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
                        {category.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-accent/20 bg-card/90 p-4 text-sm">
                  <h3 className="font-semibold text-accent">Home dashboard</h3>
                  <p className="mt-2 text-xs text-muted">Choose a theme pack and pick which widgets are visible on the home dashboard.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["minimal", "nature", "high-contrast"] as ThemePack[]).map((pack) => (
                      <button key={pack} type="button" onClick={() => setHomeThemePack(pack)} className={`rounded-full px-3 py-1 text-xs capitalize ${homeThemePack === pack ? "bg-accent text-[rgb(var(--accent-contrast))]" : "border border-accent/35 bg-accent/12 text-text hover:bg-accent/20"}`}>
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

          <aside className="order-2 border-t border-accent/20 bg-bg/66 p-[18px_14px] sm:p-[22px_18px] lg:order-0 lg:border-l lg:border-t-0">
            <div className="mb-4.5 rounded-[14px] border border-accent/20 bg-card/90 px-3 pb-3 pt-4.5 text-center">
              <div className="mx-auto mb-2.5 flex h-16.5 w-16.5 items-center justify-center overflow-hidden rounded-full border-2 border-accent/45 bg-linear-to-br from-brand to-brand-2">
                {profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{username.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <strong>{username}</strong>
              <div className="mt-0.5 text-xs text-muted">@{user?.email?.split("@")[0] ?? "naturist"}</div>
              <div className="mt-2 text-[11px] text-muted">Verification: <span className="capitalize text-text">{verificationStatus === "none" ? "Not verified" : verificationStatus}</span></div>
              <div className="mt-1 text-[11px] text-muted">Impact: {impactStats.helpfulReplies} helpful replies · {impactStats.acceptedAnswers} accepted answers</div>
              <div className="mt-3.5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-accent/20 bg-card-2/70 px-1.5 py-2"><strong className="block text-[13px]">{followersCount.toLocaleString()}</strong><span className="text-[10px] text-muted">Followers</span></div>
                <div className="rounded-[10px] border border-accent/20 bg-card-2/70 px-1.5 py-2"><strong className="block text-[13px]">{followingCount.toLocaleString()}</strong><span className="text-[10px] text-muted">Following</span></div>
                <div className="rounded-[10px] border border-accent/20 bg-card-2/70 px-1.5 py-2"><strong className="block text-[13px]">{userPostsCount.toLocaleString()}</strong><span className="text-[10px] text-muted">Posts</span></div>
              </div>
            </div>

            <div className="mb-3 text-[13px] text-muted">Profile media</div>
            <div className="space-y-3 rounded-[14px] border border-accent/20 bg-card/90 p-3">
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
                className="accent-fill w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition"
              >
                Change avatar image
              </button>
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="accent-fill w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition"
              >
                Change banner image
              </button>
            </div>
          </aside>
        </div>
    </section>
  );
}
