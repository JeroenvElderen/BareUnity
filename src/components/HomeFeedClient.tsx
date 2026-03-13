"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ChannelContent from "@/components/channels/ChannelContent";
import { ChannelContentType } from "@/lib/channel-data";

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
};

type HomeFeedClientProps = {
  posts: FeedPost[];
  channels: SidebarChannel[];
  profile: UserProfile | null;
  activityProfiles: BasicProfile[];
  authorProfiles: BasicProfile[];
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

function getChannelEmoji(name: string) {
  const key = name.toLowerCase();
  if (key.includes("retreat")) return "🏕️";
  if (key.includes("mindful")) return "🧘";
  if (key.includes("map")) return "🗺️";
  if (key.includes("discussion")) return "💬";
  if (key.includes("nature")) return "🌿";
  return "✨";
}

export default function HomeFeedClient({ posts, channels, profile, activityProfiles, authorProfiles }: HomeFeedClientProps) {
  const [activeSection, setActiveSection] = useState<string>("home");
  const authorMap = useMemo(() => new Map(authorProfiles.map((entry) => [entry.id, entry])), [authorProfiles]);
  const topPostCommentCount = posts.reduce((max, post) => Math.max(max, post._count.comments), 0);
  const activeChannel = channels.find((channel) => channel.id === activeSection) ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.2),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.12),transparent_25%),#0a0b10] p-3 text-[#eef2ff] sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border border-[#242941] bg-gradient-to-b from-white/[0.02] to-white/[0] shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr_340px]">
        <aside className="border-b border-[#242941] bg-[rgba(9,11,19,0.66)] px-4 py-[22px] lg:border-b-0 lg:border-r">
          <div className="mb-[26px] text-[22px] font-bold tracking-[0.2px]">
            Bare<span className="text-[#7c5cff]">Unity</span>
          </div>

          <div className="mb-[22px] grid gap-2 text-sm">
            <button
              type="button"
              onClick={() => setActiveSection("home")}
              className={`rounded-xl px-3 py-[11px] text-left ${
                activeSection === "home"
                  ? "border border-[rgba(124,92,255,0.4)] bg-[rgba(124,92,255,0.16)] text-[#eef2ff]"
                  : "border border-transparent text-[#8e97b8]"
              }`}
            >
              🏠 Home Feed
            </button>
            {channels.map((channel) => (
              <button
                type="button"
                key={channel.id}
                onClick={() => setActiveSection(channel.id)}
                className={`rounded-xl px-3 py-[11px] text-left ${
                  activeSection === channel.id
                    ? "border border-[rgba(124,92,255,0.4)] bg-[rgba(124,92,255,0.16)] text-[#eef2ff]"
                    : "border border-transparent text-[#8e97b8]"
                }`}
              >
                {getChannelEmoji(channel.name)} {channel.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="overflow-hidden p-[14px] sm:p-[22px]">
          <div className="mb-4 grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto]">
            <div className="rounded-[14px] border border-[#242941] bg-[#121522] px-[14px] py-[13px] text-sm text-[#8e97b8]">🔎 Search channels, creators, and tags...</div>
            <div className="flex flex-wrap gap-[10px]">
              {["For You", "Following", channels[0] ? `#${channels[0].name}` : "Trending"].map((chip) => (
                <div key={chip} className="rounded-[10px] border border-[#242941] bg-[#121522] px-[11px] py-[10px] text-xs text-[#8e97b8]">
                  {chip}
                </div>
              ))}
            </div>
          </div>

          {activeChannel ? (
            <div className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px]">
              <h2 className="mb-4 text-sm text-[#b8c0e8]">{getChannelEmoji(activeChannel.name)} {activeChannel.name}</h2>
              <ChannelContent channelId={activeChannel.id} contentType={activeChannel.contentType} />
            </div>
          ) : (
            <>
              <section className="mb-4 rounded-[18px] border border-[#242941] bg-[#121522] p-[14px]">
                <div className="mb-[10px] flex items-center gap-[10px]">
                  <div className="h-[34px] w-[34px] rounded-full bg-gradient-to-br from-[#8d76ff] to-[#2dd4bf]" />
                  <div className="flex-1 rounded-xl border border-[#242941] bg-[#171a2a] px-3 py-[11px] text-[13px] text-[#8e97b8]">
                    Share a post with all users in the community...
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {["📝 Text", "📷 Image", "📊 Poll"].map((tool) => (
                      <div key={tool} className="rounded-full border border-[#2a3150] bg-[#1e2338] px-[10px] py-[7px] text-[11px] text-[#c9cff0]">
                        {tool}
                      </div>
                    ))}
                  </div>
                  <button className="rounded-[10px] bg-[#7c5cff] px-3 py-[9px] text-xs font-semibold text-white">Post to all users</button>
                </div>
              </section>

              <section className="grid max-h-[540px] grid-cols-1 gap-3 overflow-y-auto pr-1">
                {posts.map((post) => {
                  const author = post.author_id ? authorMap.get(post.author_id) : null;
                  const authorName = author?.display_name ?? author?.username ?? "Community member";
                  const authorHandle = author?.username ?? "bareunity";
                  const isTopPost = post._count.comments === topPostCommentCount && topPostCommentCount > 0;

                  return (
                    <article key={post.id} className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px]">
                      <div className="mb-[10px] flex items-start justify-between gap-3">
                        <div className="flex items-center gap-[10px]">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8d76ff] to-[#2dd4bf] text-xs font-semibold text-white">
                            {initialsFromName(authorName)}
                          </div>
                          <div>
                            <strong className="block text-sm">{authorName}</strong>
                            <span className="text-xs text-[#8e97b8]">
                              @{authorHandle} · {formatRelativeTime(post.created_at)} · #{post.channels?.name?.toLowerCase().replace(/\s+/g, "-") ?? "general"}
                            </span>
                          </div>
                        </div>
                        <div className="h-fit rounded-full border border-[rgba(45,212,191,0.4)] bg-[rgba(45,212,191,0.08)] px-2 py-[5px] text-[11px] text-[#2dd4bf]">
                          {isTopPost ? "High engagement" : "Recent"}
                        </div>
                      </div>

                      <p className="mb-[10px] text-[13px] leading-[1.5] text-[#dce2ff]">{post.content ?? post.title ?? "No post content yet."}</p>

                      {post.media_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.media_url} alt={post.title ?? "Post media"} className="mb-[10px] h-[130px] w-full rounded-[14px] border border-[#2b3150] object-cover" />
                      ) : (
                        <div className="mb-[10px] h-[130px] rounded-[14px] border border-[#2b3150] bg-[linear-gradient(125deg,rgba(124,92,255,0.4),rgba(45,212,191,0.2)),repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_6px,transparent_6px_12px)]" />
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-[#8e97b8]">
                        <span>💬 {post._count.comments} comments</span>
                        <span>📣 {post.channels?.name ?? "General"}</span>
                        <span>📌 Save</span>
                      </div>
                    </article>
                  );
                })}

                {posts.length === 0 ? (
                  <article className="rounded-[18px] border border-[#242941] bg-[#121522] p-[14px] text-sm text-[#8e97b8]">
                    No posts yet. Create the first update from your community.
                  </article>
                ) : null}
              </section>
            </>
          )}
        </section>

        <aside className="border-t border-[#242941] bg-[rgba(9,11,19,0.66)] p-[22px_18px] lg:border-l lg:border-t-0">
          <div className="mb-3 text-[13px] tracking-[0.2px] text-[#8e97b8]">Your profile</div>
          <div className="mb-[18px] rounded-[14px] border border-[#242941] bg-[#121522] px-3 pb-3 pt-[18px] text-center">
            <div className="mx-auto mb-[10px] h-[66px] w-[66px] rounded-full border-2 border-[rgba(124,92,255,0.45)] bg-gradient-to-br from-[#7c5cff] to-[#2dd4bf]" />
            <strong>{profile?.display_name ?? profile?.username ?? "Welcome"}</strong>
            <div className="mt-0.5 text-xs text-[#8e97b8]">@{profile?.username ?? "creator"} · Product Designer</div>
            <div className="mt-[14px] grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2">
                <strong className="block text-[13px]">{numberFormatter.format(profile ? posts.length * 140 : 0)}</strong>
                <span className="text-[10px] text-[#8e97b8]">Followers</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2">
                <strong className="block text-[13px]">{authorProfiles.length}</strong>
                <span className="text-[10px] text-[#8e97b8]">Following</span>
              </div>
              <div className="rounded-[10px] border border-[#2b3150] bg-[#171c2d] px-[6px] py-2">
                <strong className="block text-[13px]">{posts.length}</strong>
                <span className="text-[10px] text-[#8e97b8]">Posts</span>
              </div>
            </div>
            <Link href="/profile" className="mt-3 inline-flex rounded-full border border-[#384271] px-3 py-2 text-xs font-semibold text-[#dbe3ff] hover:bg-[#1d2238]">
              View full profile
            </Link>
          </div>

          <div className="mb-3 text-[13px] tracking-[0.2px] text-[#8e97b8]">Goals this week</div>
          <div className="mb-[18px] rounded-[14px] border border-[#242941] bg-[#121522] p-3 text-xs">
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
          </div>

          <div className="mb-3 text-[13px] tracking-[0.2px] text-[#8e97b8]">Recent activity</div>
          <div className="rounded-[14px] border border-[#242941] bg-[#121522] p-3">
            {activityProfiles.map((entry, index) => (
              <div key={entry.id} className={`grid grid-cols-[auto_1fr] gap-[10px] ${index < activityProfiles.length - 1 ? "mb-[10px]" : ""}`}>
                <div className="mt-[6px] h-2 w-2 rounded-full bg-[#2dd4bf] shadow-[0_0_0_4px_rgba(45,212,191,0.14)]" />
                <div>
                  <p className="m-0 text-xs leading-[1.35] text-[#dbe3ff]">{entry.display_name ?? entry.username} joined and started exploring channels.</p>
                  <span className="text-[11px] text-[#8e97b8]">{index + 1}h ago</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}