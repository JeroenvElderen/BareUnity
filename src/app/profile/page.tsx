"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FeedView } from "@/components/Feed";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const tabs = ["Overview", "Posts", "Comments", "Saved", "History", "Upvoted"];
const settingsMenuItems = ["Profile style", "Feed style", "Privacy", "Friend requests", "Friends"] as const;

type MediaPost = {
  id: string;
  media_url: string | null;
};

type FriendStatus = "online" | "away" | "offline";

type Friend = {
  id: string;
  username: string;
  status: FriendStatus;
};

type FriendRequest = {
  id: string;
  username: string;
  mutualFriends: number;
};

type PrivacySettings = {
  showEmail: boolean;
  showActivity: boolean;
  allowFriendRequests: boolean;
};

type ProfileSettingsRow = {
  profile_primary: string;
  profile_secondary: string;
  show_email: boolean;
  show_activity: boolean;
  allow_friend_requests: boolean;
  feed_style: FeedView;
  friends: Friend[] | null;
  friend_requests: FriendRequest[] | null;
};

const starterFriends: Friend[] = [
  { id: "f1", username: "suntrail_sam", status: "online" },
  { id: "f2", username: "openairlena", status: "away" },
];

const starterRequests: FriendRequest[] = [
  { id: "r1", username: "naturealex", mutualFriends: 3 },
  { id: "r2", username: "campmila", mutualFriends: 1 },
];

const defaultSettings = {
  profilePrimary: "#1fd8b5",
  profileSecondary: "#112b44",
  privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
  friends: starterFriends,
  friendRequests: starterRequests,
  feedStyle: "balanced" as FeedView,
};

function shimmerLine(width: string) {
  return <div className="h-2 rounded-full bg-white/15" style={{ width }} />;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [mediaPosts, setMediaPosts] = useState<MediaPost[]>([]);
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeSettingsItem, setActiveSettingsItem] = useState<(typeof settingsMenuItems)[number]>("Profile style");
  const [profilePrimary, setProfilePrimary] = useState(defaultSettings.profilePrimary);
  const [profileSecondary, setProfileSecondary] = useState(defaultSettings.profileSecondary);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultSettings.privacy);
  const [friends, setFriends] = useState<Friend[]>(defaultSettings.friends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(defaultSettings.friendRequests);
  const [feedStyle, setFeedStyle] = useState<FeedView>(defaultSettings.feedStyle);
  const [loadedSettingsUserId, setLoadedSettingsUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMediaPosts([]);
        setProfilePrimary(defaultSettings.profilePrimary);
        setProfileSecondary(defaultSettings.profileSecondary);
        setPrivacy(defaultSettings.privacy);
        setFriends(defaultSettings.friends);
        setFriendRequests(defaultSettings.friendRequests);
        setFeedStyle(defaultSettings.feedStyle);
        setLoadedSettingsUserId(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!user?.id) {
        return;
      }

      const { data, error } = await supabase
        .from("profile_settings")
        .select("profile_primary, profile_secondary, show_email, show_activity, allow_friend_requests, feed_style, friends, friend_requests")
        .eq("user_id", user.id)
        .maybeSingle<ProfileSettingsRow>();

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
          },
          { onConflict: "user_id" },
        );

        if (createError) {
          console.error(createError);
        }

        setLoadedSettingsUserId(user.id);
        return;
      }

      setProfilePrimary(data.profile_primary ?? defaultSettings.profilePrimary);
      setProfileSecondary(data.profile_secondary ?? defaultSettings.profileSecondary);
      setPrivacy({
        showEmail: data.show_email ?? defaultSettings.privacy.showEmail,
        showActivity: data.show_activity ?? defaultSettings.privacy.showActivity,
        allowFriendRequests: data.allow_friend_requests ?? defaultSettings.privacy.allowFriendRequests,
      });
      setFeedStyle(data.feed_style ?? defaultSettings.feedStyle);
      setFriends(data.friends ?? defaultSettings.friends);
      setFriendRequests(data.friend_requests ?? defaultSettings.friendRequests);
      setLoadedSettingsUserId(user.id);
    }

    loadSettings();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || loadedSettingsUserId !== user.id) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      const { error } = await supabase.from("profile_settings").upsert(
        {
          user_id: user.id,
          profile_primary: profilePrimary,
          profile_secondary: profileSecondary,
          show_email: privacy.showEmail,
          show_activity: privacy.showActivity,
          allow_friend_requests: privacy.allowFriendRequests,
          feed_style: feedStyle,
          friends,
          friend_requests: friendRequests,
        },
        { onConflict: "user_id" },
      );

      if (error) {
        console.error(error);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [user?.id, loadedSettingsUserId, profilePrimary, profileSecondary, privacy, feedStyle, friends, friendRequests]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    async function loadMedia() {
      const { data, error } = await supabase
        .from("posts")
        .select("id, media_url")
        .eq("author_id", userId)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        console.error(error);
        return;
      }

      setMediaPosts((data ?? []) as MediaPost[]);
    }

    loadMedia();
  }, [user]);

  const username = useMemo(() => {
    if (!user) return "Guest";
    return user.user_metadata?.username || user.email?.split("@")[0] || "Naturist";
  }, [user]);

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

  function renderSettingsPanel() {
    if (activeSettingsItem === "Profile style") {
      return (
        <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
          <h3 className="text-sm font-semibold text-cyan-100">Custom profile colors</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-cyan-100/70">
              Primary
              <input type="color" value={profilePrimary} onChange={(event) => setProfilePrimary(event.target.value)} className="mt-1 h-9 w-full rounded border border-white/20 bg-transparent" />
            </label>
            <label className="text-xs text-cyan-100/70">
              Secondary
              <input type="color" value={profilePrimary} onChange={(event) => setProfilePrimary(event.target.value)} className="mt-1 h-9 w-full rounded border border-white/20 bg-transparent" />
            </label>
          </div>
        </section>
      );
    }

    if (activeSettingsItem === "Feed style") {
      return (
        <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
          <h3 className="text-sm font-semibold text-cyan-100">Feed style</h3>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setFeedStyle("balanced")}
              className={`rounded-full px-3 py-1 text-xs ${feedStyle === "balanced" ? "bg-cyan-400 text-[#041222]" : "border border-white/20 text-cyan-100"}`}
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => setFeedStyle("magazine")}
              className={`rounded-full px-3 py-1 text-xs ${feedStyle === "magazine" ? "bg-cyan-400 text-[#041222]" : "border border-white/20 text-cyan-100"}`}
            >
              Magazine
            </button>
          </div>
        </section>
      );
    }

    if (activeSettingsItem === "Privacy") {
      return (
        <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4 text-sm text-cyan-100/80">
          <h3 className="text-sm font-semibold text-cyan-100">Privacy settings</h3>
          <div className="mt-3 space-y-2">
            <label className="flex items-center justify-between">Show email<input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} /></label>
            <label className="flex items-center justify-between">Show activity<input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} /></label>
            <label className="flex items-center justify-between">Allow requests<input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} /></label>
          </div>
        </section>
      );
    }

    if (activeSettingsItem === "Friend requests") {
      return (
        <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
          <h3 className="text-sm font-semibold text-cyan-100">Friend requests</h3>
          <div className="mt-3 space-y-2">
            {friendRequests.length === 0 ? (
              <p className="text-xs text-cyan-100/70">No pending requests.</p>
            ) : (
              friendRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-white/15 bg-[#091629] p-3 text-xs text-cyan-100/85">
                  <p className="font-semibold">u/{request.username}</p>
                  <p className="text-cyan-100/60">{request.mutualFriends} mutual friends</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => acceptRequest(request)} className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white">Accept</button>
                    <button type="button" onClick={() => declineRequest(request.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px]">Decline</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-white/15 bg-[#0f2037]/80 p-4">
        <h3 className="text-sm font-semibold text-cyan-100">Friends ({friends.length})</h3>
        <ul className="mt-3 space-y-2 text-xs text-cyan-100/85">
          {friends.map((friend) => (
            <li key={friend.id} className="flex items-center justify-between rounded-lg border border-white/15 bg-[#091629] px-3 py-2">
              <span>u/{friend.username}</span>
              <span className="capitalize text-cyan-100/60">{friend.status}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const statCards = [
    { label: "Followers", value: "14.2k" },
    { label: "Following", value: "812" },
    { label: "Posts", value: "326" },
    { label: "Engagement", value: "94%" },
    { label: "Badges", value: "48" },
  ];

  const surfaceCards = ["Featured Story", "Activity Capsule", "Saved Highlights", "Community Pulse", "Media Shelf", "Comment Lab"];

  return (
    <div className="min-h-screen bg-[#030816] p-5 text-cyan-50 md:p-8">
      <div className="mx-auto flex w-full max-w-[1360px] overflow-hidden rounded-[26px] border border-cyan-200/15 bg-[#050e21] shadow-[0_0_0_1px_rgba(125,211,252,0.05),0_24px_80px_-30px_rgba(0,0,0,0.8)]">
        <aside className="hidden w-[260px] shrink-0 border-r border-cyan-100/15 bg-gradient-to-b from-[#172544] to-[#071334] p-4 md:flex md:flex-col">
          <div className="text-3xl font-black tracking-tight text-emerald-400">BareUnity</div>
          <nav className="mt-6 space-y-2 text-lg">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`block w-full rounded-xl px-4 py-2 text-left transition ${activeTab === tab ? "bg-gradient-to-r from-emerald-500/35 to-cyan-500/35 text-cyan-50" : "bg-[#1d2a4d]/55 text-cyan-100/80 hover:bg-[#24355f]/75"}`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <Link href="/" className="mt-auto block rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-2 text-center text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300/25">
            ← Return Home
          </Link>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="rounded-3xl border border-cyan-100/15 bg-[#0a1732] px-5 py-3 text-2xl font-medium text-cyan-100">Midnight Ledger</div>

          <section
            className="mt-4 relative overflow-hidden rounded-3xl border border-cyan-100/20 p-7"
            style={{ background: `linear-gradient(110deg, ${profilePrimary}66, #0e2a3f 50%, ${profileSecondary}99)` }}
          >
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#081124] text-2xl font-bold text-[#041222]" style={{ background: `linear-gradient(145deg, ${profilePrimary}, #1ee2bb)` }}>
                {username.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h1 className="text-4xl font-bold text-cyan-50">{username}</h1>
                <p className="text-base text-cyan-100/70">Product Designer · Premium Member</p>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {statCards.map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-cyan-100/15 bg-[#08182f] p-4">
                <p className="text-4xl font-semibold leading-none text-cyan-100">{stat.value}</p>
                <p className="mt-1 text-2xl text-cyan-100/80">{stat.label}</p>
              </article>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <article className="rounded-3xl border border-cyan-100/15 bg-[#08182f] p-4">
                <h2 className="text-3xl font-semibold text-cyan-100">Introduction</h2>
                <div className="mt-4 space-y-2">{shimmerLine("100%")}{shimmerLine("84%")}{shimmerLine("68%")}</div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/15 px-3 py-1">UI Systems</span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/15 px-3 py-1">Motion</span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/15 px-3 py-1">Design Ops</span>
                </div>
              </article>

              <article className="rounded-3xl border border-cyan-100/15 bg-[#08182f] p-4">
                <h2 className="text-3xl font-semibold text-cyan-100">Quick Actions</h2>
                <div className="mt-4 space-y-2">{shimmerLine("92%")}{shimmerLine("74%")}{shimmerLine("79%")}</div>
              </article>

              <div className="grid grid-cols-2 gap-2">
                {settingsMenuItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                      onClick={() => setActiveSettingsItem(item)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${activeSettingsItem === item ? "border-cyan-200/45 bg-cyan-200/20 text-cyan-50" : "border-cyan-100/20 bg-[#091629] text-cyan-100/70"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {renderSettingsPanel()}
            </div>

            <article className="rounded-3xl border border-cyan-100/15 bg-[#08182f] p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {surfaceCards.map((card) => (
                  <div key={card} className="rounded-2xl border border-cyan-100/15 bg-gradient-to-r from-white/5 to-cyan-100/5 p-4">
                    <h3 className="text-2xl font-semibold text-cyan-100">{card}</h3>
                    <div className="mt-3 space-y-2">{shimmerLine("100%")}{shimmerLine("64%")}</div>
                  </div>
                  ))}
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-100/15 bg-[#091629] p-4">
                <h3 className="text-lg font-semibold text-cyan-100">Recent media</h3>
                {mediaPosts.length === 0 ? (
                  <p className="mt-2 text-sm text-cyan-100/65">No media uploaded yet.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {mediaPosts.slice(0, 6).map((post) => (
                      <div key={post.id} className="overflow-hidden rounded-xl border border-cyan-100/15 bg-[#071225]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={post.media_url ?? ""} alt="Profile media" className="h-24 w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
