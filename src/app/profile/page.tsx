"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

const tabs = ["Overview", "Posts", "Comments", "Saved", "History", "Upvoted"];
const settingsMenuItems = ["Profile style", "Privacy", "Friend requests", "Friends"] as const;
const PROFILE_SETTINGS_STORAGE_KEY = "bareunity-profile-settings";

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

const starterFriends: Friend[] = [
  { id: "f1", username: "suntrail_sam", status: "online" },
  { id: "f2", username: "openairlena", status: "away" },
];

const starterRequests: FriendRequest[] = [
  { id: "r1", username: "naturealex", mutualFriends: 3 },
  { id: "r2", username: "campmila", mutualFriends: 1 },
];

function readStoredSettings() {
  if (typeof window === "undefined") {
    return {
      profilePrimary: "#345f45",
      profileSecondary: "#1f3326",
      privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
      friends: starterFriends,
      friendRequests: starterRequests,
    };
  }

  const raw = window.localStorage.getItem(PROFILE_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return {
      profilePrimary: "#345f45",
      profileSecondary: "#1f3326",
      privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
      friends: starterFriends,
      friendRequests: starterRequests,
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      profilePrimary?: string;
      profileSecondary?: string;
      privacy?: PrivacySettings;
      friends?: Friend[];
      friendRequests?: FriendRequest[];
    };

    return {
      profilePrimary: parsed.profilePrimary ?? "#345f45",
      profileSecondary: parsed.profileSecondary ?? "#1f3326",
      privacy: parsed.privacy ?? { showEmail: false, showActivity: true, allowFriendRequests: true },
      friends: parsed.friends ?? starterFriends,
      friendRequests: parsed.friendRequests ?? starterRequests,
    };
  } catch {
    return {
      profilePrimary: "#345f45",
      profileSecondary: "#1f3326",
      privacy: { showEmail: false, showActivity: true, allowFriendRequests: true } as PrivacySettings,
      friends: starterFriends,
      friendRequests: starterRequests,
    };
  }
}

export default function ProfilePage() {
  const [initialSettings] = useState(readStoredSettings);
  const [user, setUser] = useState<User | null>(null);
  const [mediaPosts, setMediaPosts] = useState<MediaPost[]>([]);
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeSettingsItem, setActiveSettingsItem] = useState<(typeof settingsMenuItems)[number]>("Profile style");
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [profilePrimary, setProfilePrimary] = useState(initialSettings.profilePrimary);
  const [profileSecondary, setProfileSecondary] = useState(initialSettings.profileSecondary);
  const [privacy, setPrivacy] = useState<PrivacySettings>(initialSettings.privacy);
  const [friends, setFriends] = useState<Friend[]>(initialSettings.friends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(initialSettings.friendRequests);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMediaPosts([]);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PROFILE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ profilePrimary, profileSecondary, privacy, friends, friendRequests }),
    );
  }, [profilePrimary, profileSecondary, privacy, friends, friendRequests]);

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
        <section className="rounded-2xl border border-accent/20 bg-card/70 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-accent/85">Custom profile colors</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Primary
              <input type="color" value={profilePrimary} onChange={(event) => setProfilePrimary(event.target.value)} className="mt-1 h-9 w-full rounded border border-accent/20 bg-transparent" />
            </label>
            <label className="text-xs text-muted">
              Secondary
              <input type="color" value={profileSecondary} onChange={(event) => setProfileSecondary(event.target.value)} className="mt-1 h-9 w-full rounded border border-accent/20 bg-transparent" />
            </label>
          </div>
        </section>
      );
    }

    if (activeSettingsItem === "Privacy") {
      return (
        <section className="rounded-2xl border border-accent/20 bg-card/70 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-accent/85">Privacy settings</h3>
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center justify-between gap-2">
              Show email on profile
              <input type="checkbox" checked={privacy.showEmail} onChange={(event) => updatePrivacy("showEmail", event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2">
              Show activity status
              <input type="checkbox" checked={privacy.showActivity} onChange={(event) => updatePrivacy("showActivity", event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2">
              Allow friend requests
              <input type="checkbox" checked={privacy.allowFriendRequests} onChange={(event) => updatePrivacy("allowFriendRequests", event.target.checked)} />
            </label>
          </div>
        </section>
      );
    }

    if (activeSettingsItem === "Friend requests") {
      return (
        <section className="rounded-2xl border border-accent/20 bg-card/70 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-accent/85">Friend requests</h3>
          <div className="mt-3 space-y-3">
            {friendRequests.length === 0 ? (
              <p className="text-sm text-muted">No pending requests.</p>
            ) : (
              friendRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-accent/20 bg-bg/50 p-3">
                  <p className="font-semibold text-accent">u/{request.username}</p>
                  <p className="text-xs text-muted">{request.mutualFriends} mutual friends</p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button type="button" onClick={() => acceptRequest(request)} className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white">Accept</button>
                    <button type="button" onClick={() => declineRequest(request.id)} className="rounded-full border border-accent/30 px-3 py-1 font-semibold text-accent">Decline</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-accent/20 bg-card/70 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-accent/85">Friends ({friends.length})</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {friends.map((friend) => (
            <li key={friend.id} className="flex items-center justify-between rounded-lg border border-accent/20 bg-bg/50 px-3 py-2">
              <span>u/{friend.username}</span>
              <span className="text-xs capitalize text-muted">{friend.status}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-[#030711] text-cyan-50">
      <Topbar />
      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 px-4 py-6 md:px-8">
            <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-cyan-300/20 bg-[#0a1424]">
                  <div className="h-40 bg-cover bg-center" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1510784722466-f2aa9c52fff6?q=80&w=1600&auto=format&fit=crop)" }} />
                  <p className="px-4 py-3 text-sm text-cyan-100/70">A fresh profile canvas built for highlights, media, and quick actions.</p>
                </div>

                <div className="rounded-3xl border border-cyan-300/20 bg-[#0d1b2f] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-accent/35 text-xl font-bold text-accent" style={{ background: `linear-gradient(135deg, ${profilePrimary}, ${profileSecondary})` }}>
                      {username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-accent">{username}</h1>
                      <p className="text-sm text-muted">u/{username}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {tabs.map((tab) => (
                    <button
                    type="button"
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        activeTab === tab ? "bg-brand text-bg" : "bg-card/70 text-text/85 hover:bg-bg/60"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsSettingsMenuOpen((open) => !open)}
                      className="rounded-full border border-accent/35 bg-card/70 px-4 py-2 text-sm font-semibold text-accent"
                    >
                      Settings ▾
                    </button>

                    {isSettingsMenuOpen && (
                      <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-accent/20 bg-card/85 p-2 shadow-2xl">
                        {settingsMenuItems.map((item) => (
                          <button
                            type="button"
                            key={item}
                            onClick={() => {
                              setActiveSettingsItem(item);
                              setIsSettingsMenuOpen(false);
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${activeSettingsItem === item ? "bg-brand text-bg" : "text-accent hover:bg-bg/60"}`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-accent/20 bg-card/70/70 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-accent">Profile media gallery</h2>
                    <span className="text-xs text-muted">Recent uploads</span>
                  </div>

                  {mediaPosts.length === 0 ? (
                    <p className="text-sm text-muted">No media uploaded yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {mediaPosts.map((post) => (
                        <div key={post.id} className="overflow-hidden rounded-xl border border-accent/20 bg-bg/55">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={post.media_url ?? ""} alt="Profile media" className="h-32 w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-accent/20 bg-card/70 p-4">
                  <div className="mb-3 h-24 rounded-xl" style={{ background: `linear-gradient(90deg, ${profilePrimary}, ${profileSecondary})` }} />
                  <h3 className="text-xl font-bold text-accent">{username}</h3>
                  <p className="text-sm text-muted">🌿 Living naturally and building a kind channel space.</p>
                </div>
                
                {renderSettingsPanel()}
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
