"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SidebarMenu from "@/components/SidebarMenu";
import CreatePost from "@/components/CreatePost";
import { ChannelContentType } from "@/lib/channel-data";
import { supabase } from "@/lib/supabase";

type FeedPost = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string | Date | null;
  author_id: string | null;
  channel_id: string | null;
  media_url: string | null;
  post_type: string | null;
  channels: { name: string } | null;
  _count: { comments: number };
};

type SidebarChannel = {
  id: string;
  name: string;
  iconUrl: string | null;
  contentType: ChannelContentType;
};

type BasicProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

type UserProfile = {
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
};

type HomeFeedClientProps = {
  posts: FeedPost[];
  channels: SidebarChannel[];
  profile: UserProfile | null;
  activityProfiles: BasicProfile[];
  authorProfiles: BasicProfile[];
};

type ThemePack = "minimal" | "nature" | "high-contrast";
type DashboardWidgetKey = "profile_card" | "goals" | "recent_activity";
type DashboardWidgets = Record<DashboardWidgetKey, boolean>;

const defaultWidgets: DashboardWidgets = {
  profile_card: true,
  goals: true,
  recent_activity: true,
};

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function formatRelativeTime(dateValue: string | Date | null) {
  if (!dateValue) return "just now";

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  return `${Math.floor(diffMs / day)}d ago`;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function HomeFeedClient({ posts, channels, profile, activityProfiles, authorProfiles }: HomeFeedClientProps) {
  const authorMap = useMemo(() => new Map(authorProfiles.map((entry) => [entry.id, entry])), [authorProfiles]);
  const topPostCommentCount = posts.reduce((max, post) => Math.max(max, post._count.comments), 0);
  const [viewerProfile, setViewerProfile] = useState<UserProfile | null>(profile);
  const [themePack, setThemePack] = useState<ThemePack>("nature");
  const [widgets, setWidgets] = useState<DashboardWidgets>(defaultWidgets);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardSettings() {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user?.id;

      if (!userId || !mounted) return;

      const { data } = await supabase
        .from("profile_settings")
        .select("home_theme_pack, dashboard_widgets, avatar_url, banner_url")
        .eq("user_id", userId)
        .maybeSingle<{ home_theme_pack: ThemePack | null; dashboard_widgets: DashboardWidgets | null; avatar_url: string | null; banner_url: string | null }>();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle<{ username: string; display_name: string | null; avatar_url: string | null }>();

      if (!mounted) return;

      if (profileData) {
        setViewerProfile({
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: data?.avatar_url ?? profileData.avatar_url,
          banner_url: data?.banner_url ?? null,
        });
      }

      if (!data) return;

      if (data.home_theme_pack) setThemePack(data.home_theme_pack);
      if (data.dashboard_widgets) setWidgets({ ...defaultWidgets, ...data.dashboard_widgets });
    }

    void loadDashboardSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const theme =
    themePack === "minimal"
      ? {
          page: "bg-[#090a0e] text-[#e8ebf8]",
          shell: "border-[#23252f]",
          panel: "border-[#23252f] bg-[#12141b]",
          subtleText: "text-[#9ea4bc]",
        }
      : themePack === "high-contrast"
        ? {
            page: "bg-black text-white",
            shell: "border-white/40",
            panel: "border-white/35 bg-[#0a0a0a]",
            subtleText: "text-white/80",
          }
        : {
            page: "text-text",
            shell: "border-accent/20",
            panel: "glass-card border-accent/20",
            subtleText: "text-muted",
          };

  return (
    <main className={`min-h-screen p-3 sm:p-6 ${theme.page}`}>
      <div className={`mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border bg-linear-to-b from-white/2 to-white/0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr_340px] ${theme.shell}`}>
        <div className={`border-b p-3 lg:border-b-0 lg:border-r lg:p-4 ${theme.shell}`}>
          <SidebarMenu channels={channels} onCreatePost={() => setIsComposerOpen(true)} />
        </div>

        <section className="overflow-hidden p-3.5 sm:p-5.5">
          <div className="mb-4 grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto]">
            <div className={`rounded-[14px] border px-3.5 py-3.25 text-sm ${theme.panel} ${theme.subtleText}`}>🔎 Search channels, creators, and tags...</div>
            <div className="flex flex-wrap gap-2.5">
              {["For You", "Following", channels[0] ? `#${channels[0].name}` : "Trending"].map((chip) => (
                <div key={chip} className={`rounded-[10px] border px-2.75 py-2.5 text-xs ${theme.panel} ${theme.subtleText}`}>
                  {chip}
                </div>
              ))}
            </div>
          </div>

          <section className={`mb-4 rounded-[14px] border p-3 text-xs ${theme.panel}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong>Customize home dashboard</strong>
              <span className={theme.subtleText}>Change in profile settings</span>
            </div>
            <div className={`flex flex-wrap gap-x-4 gap-y-2 ${theme.subtleText}`}>
              <label className="flex items-center gap-2"><input type="checkbox" checked={widgets.profile_card} readOnly /> Profile card</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={widgets.goals} readOnly /> Weekly goals</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={widgets.recent_activity} readOnly /> Recent activity</label>
              <span>Theme: {themePack}</span>
            </div>
          </section>

          <>
              <section className="grid max-h-135 grid-cols-1 gap-3 overflow-y-auto pr-1">
                {posts.map((post) => {
                  const author = post.author_id ? authorMap.get(post.author_id) : null;
                  const authorName = author?.display_name ?? author?.username ?? "Community member";
                  const authorHandle = author?.username ?? "bareunity";
                  const isTopPost = post._count.comments === topPostCommentCount && topPostCommentCount > 0;

                  return (
                    <article key={post.id} className={`rounded-[18px] border p-3.5 ${theme.panel}`}>
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-[#8d76ff] to-[#2dd4bf] text-xs font-semibold text-white">
                            {initialsFromName(authorName)}
                          </div>
                          <div>
                            <strong className="block text-sm">{authorName}</strong>
                            <span className={`text-xs ${theme.subtleText}`}>
                              @{authorHandle} · {formatRelativeTime(post.created_at)} · #{post.channels?.name?.toLowerCase().replace(/\s+/g, "-") ?? "general"}
                            </span>
                          </div>
                        </div>
                        <div className="h-fit rounded-full border border-[rgba(45,212,191,0.4)] bg-[rgba(45,212,191,0.08)] px-2 py-1.25 text-[11px] text-[#2dd4bf]">
                          {isTopPost ? "High engagement" : "Recent"}
                        </div>
                      </div>

                      <p className="mb-2.5 text-[13px] leading-normal text-[#dce2ff]">{post.content ?? post.title ?? "No post content yet."}</p>

                      {post.media_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.media_url} alt={post.title ?? "Post media"} className="mb-2.5 h-32.5 w-full rounded-[14px] border border-[#2b3150] object-cover" />

                      ) : (
                        <div className="mb-2.5 h-32.5 rounded-[14px] border border-[#2b3150] bg-[linear-gradient(125deg,rgba(124,92,255,0.4),rgba(45,212,191,0.2)),repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_6px,transparent_6px_12px)]" />
                      )}

                      <div className={`flex flex-wrap gap-4 text-xs ${theme.subtleText}`}>
                        <span>💬 {post._count.comments} comments</span>
                        <span>📣 {post.channels?.name ?? "General"}</span>
                        <span>📌 Save</span>
                      </div>
                    </article>
                  );
                })}

                {posts.length === 0 ? (
                  <article className={`rounded-[18px] border p-3.5 text-sm ${theme.panel} ${theme.subtleText}`}>
                    No posts yet. Create the first update from your community.
                  </article>
                ) : null}
              </section>
            </>

          {isComposerOpen ? (
            <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Create post flyout">
              <button
                type="button"
                aria-label="Close create post"
                onClick={() => setIsComposerOpen(false)}
                className="absolute inset-0 bg-[#04060c]/75 backdrop-blur-sm"
              />
              <div className="relative ml-auto h-full w-full max-w-[960px] overflow-y-auto border-l border-[#2a3445] bg-[#070e18] p-3 sm:p-5">
                <CreatePost onCancel={() => setIsComposerOpen(false)} onPublished={() => setIsComposerOpen(false)} />
              </div>
            </div>
          ) : null}
        </section>

        <aside className={`border-t bg-[rgba(9,11,19,0.66)] p-[22px_18px] lg:border-l lg:border-t-0 ${theme.shell}`}>
          {widgets.profile_card ? (
          <div className={`mb-4.5 rounded-[14px] border px-3 pb-3 pt-4.5 text-center ${theme.panel}`}>
            {viewerProfile?.banner_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewerProfile.banner_url} alt="Profile banner" className="-mx-3 -mt-4.5 mb-3 h-14 w-[calc(100%+24px)] rounded-t-xl object-cover opacity-80" />
            ) : null}
            <div className="mx-auto mb-2.5 flex h-16.5 w-16.5 items-center justify-center overflow-hidden rounded-full border-2 border-[rgba(124,92,255,0.45)] bg-linear-to-br from-[#7c5cff] to-[#2dd4bf]">
              {viewerProfile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewerProfile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-white">{initialsFromName(viewerProfile?.display_name ?? viewerProfile?.username ?? "Welcome")}</span>
              )}
            </div>
            <strong>{viewerProfile?.display_name ?? viewerProfile?.username ?? "Welcome"}</strong>
            <div className={`mt-0.5 text-xs ${theme.subtleText}`}>@{viewerProfile?.username ?? "creator"} · Product Designer</div>
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{numberFormatter.format(viewerProfile ? posts.length * 140 : 0)}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Followers</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{authorProfiles.length}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Following</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-1.5 py-2">
                <strong className="block text-[13px]">{posts.length}</strong>
                <span className={`text-[10px] ${theme.subtleText}`}>Posts</span>
              </div>
            </div>
            <Link href="/profile" className="mt-3 inline-flex rounded-full border border-[#384271] px-3 py-2 text-xs font-semibold text-[#dbe3ff] hover:bg-[#1d2238]">
              View full profile
            </Link>
          </div>
          ) : null}

          {widgets.goals ? <><div className={`mb-3 text-[13px] tracking-[0.2px] ${theme.subtleText}`}>Goals this week</div>
          <div className={`mb-4.5 rounded-[14px] border p-3 text-xs ${theme.panel}`}>
            <div className="flex items-center justify-between border-b border-dashed border-[#2a3151] py-2">
              <span>Ship feed prototype</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">In review</span>
            </div>
            <div className="flex items-center justify-between border-b border-dashed border-[#2a3151] py-2">
              <span>Publish channel update</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">{Math.min(posts.length, 3)}/3 done</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Reply to comments</span>
              <span className="rounded-full border border-[#384271] px-2 py-1 text-[10px] text-[#cfd6fa]">{posts.reduce((sum, post) => sum + post._count.comments, 0)} pending</span>
            </div>
          </div></> : null}

          {widgets.recent_activity ? <><div className={`mb-3 text-[13px] tracking-[0.2px] ${theme.subtleText}`}>Recent activity</div>
          <div className={`rounded-[14px] border p-3 ${theme.panel}`}>
            {activityProfiles.map((entry, index) => (
              <div key={entry.id} className={`grid grid-cols-[auto_1fr] gap-2.5 ${index < activityProfiles.length - 1 ? "mb-2.5" : ""}`}>
                <div className="mt-1.5 h-2 w-2 rounded-full bg-[#2dd4bf] shadow-[0_0_0_4px_rgba(45,212,191,0.14)]" />
                <div>
                  <p className="m-0 text-xs leading-[1.35] text-[#dbe3ff]">{entry.display_name ?? entry.username} joined and started exploring channels.</p>
                  <span className={`text-[11px] ${theme.subtleText}`}>{index + 1}h ago</span>
                </div>
              </div>
            ))}
          </div></> : null}
        </aside>
      </div>
    </main>
  );
}