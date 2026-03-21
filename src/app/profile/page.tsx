import Image from "next/image";

import { FloatingSidebarProfileLink } from "@/components/sidebar/profile-link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { db } from "@/server/db";
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
};

type ProfileSettingsRow = {
  interests: string[] | null;
};

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

function resolveMediaUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith("http")) return value;

  const normalizedPath = value.startsWith("posts/") ? value : `posts/${value}`;
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

async function getProfileData() {
  if (!isSupabaseConfigured && !isSupabaseAdminConfigured) {
    return {
      profile: null as ProfileRow | null,
      posts: [] as PostRow[],
      interests: [] as string[],
      stats: { posts: 0, friends: 0, comments: 0 },
    };
  }

  const client = isSupabaseAdminConfigured ? createSupabaseAdminClient() : supabase;

  const { data: profileData } = await client
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,location")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profile = (profileData ?? null) as ProfileRow | null;

  if (!profile) {
    return {
      profile,
      posts: [] as PostRow[],
      interests: [] as string[],
      stats: { posts: 0, friends: 0, comments: 0 },
    };
  }

  const [{ data: postsData }, { data: settingsData }] = await Promise.all([
    client
      .from("posts")
      .select("id,title,content,media_url,created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
    client.from("profile_settings").select("interests").eq("user_id", profile.id).maybeSingle(),
  ]);

  let stats = { posts: 0, friends: 0, comments: 0 };

  try {
    const [postCount, friendCount, commentCount] = await Promise.all([
      db.posts.count({ where: { author_id: profile.id } }),
      db.friendships.count({ where: { user_id: profile.id } }),
      db.comments.count({ where: { author_id: profile.id } }),
    ]);

    stats = {
      posts: postCount,
      friends: friendCount,
      comments: commentCount,
    };
  } catch (error) {
    console.error("Failed to load profile stats from Prisma", error);
  }

  return {
    profile,
    posts: (postsData ?? []) as PostRow[],
    interests: ((settingsData as ProfileSettingsRow | null)?.interests ?? []).slice(0, 8),
    stats,
  };
}

export default async function ProfilePage() {
  const { profile, posts, interests, stats } = await getProfileData();

  const displayName = profile?.display_name?.trim() || profile?.username || "BareUnity Member";
  const bio = profile?.bio?.trim() || "Nature-first connection, consent-forward gatherings, and calm community rituals.";
  const avatarFallback = getInitials(displayName);

  return (
    <main className={`${layoutStyles.main} w-full`}>
      <AppSidebar />
      <FloatingSidebarProfileLink />

      <section className="min-w-0 flex-1 overflow-x-hidden bg-[rgb(var(--bg-deep))/0.55] p-0">
        <Card className="min-h-full rounded-none border-x-0 border-y-0 border-[rgb(var(--border))] bg-[rgb(var(--card))/0.98] shadow-none">
          <div className="relative h-40 border-b border-[rgb(var(--border))/0.75] bg-[linear-gradient(110deg,rgb(var(--brand))_0%,rgb(var(--accent-soft))_100%)] md:h-48" />

          <CardContent className="space-y-4 p-3 md:p-5">
            <div className="-mt-16 pl-0 md:-mt-20 md:pl-1">
              <Avatar
                src={resolveMediaUrl(profile?.avatar_url ?? null) ?? undefined}
                alt={displayName}
                fallback={avatarFallback}
                className="h-24 w-24 border-4 border-white bg-[rgb(var(--bg-soft))] text-2xl shadow-lg md:h-28 md:w-28"
              />
            </div>

            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4">
              <h1 className="text-3xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-4xl">{displayName}</h1>
              <p className="mt-1 text-base text-[rgb(var(--muted))] md:text-lg">{bio}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))] hover:bg-[rgb(var(--accent-soft))]">Verified</Badge>
                {profile?.location ? <Badge variant="outline">{profile.location}</Badge> : null}
              </div>
            </section>

            <section className="grid gap-2.5 md:grid-cols-3">
              {[
                { label: "Posts", value: stats.posts.toLocaleString() },
                { label: "Friends", value: stats.friends.toLocaleString() },
                { label: "Comments", value: stats.comments.toLocaleString() },
              ].map((item) => (
                <article key={item.label} className="rounded-xl border border-[rgb(var(--border))] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">{item.label}</p>
                  <p className="text-2xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-3xl">{item.value}</p>
                </article>
              ))}
            </section>

            {interests.length > 0 ? (
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--muted))]">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-[rgb(var(--bg-soft))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--text))]"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>Timeline</Badge>
                <Badge variant="outline">Masonry</Badge>
                <Badge variant="outline">Supabase + Prisma</Badge>
              </div>

              {posts.length === 0 ? (
                <p className="text-sm text-[rgb(var(--muted))]">No posts yet for this profile.</p>
              ) : (
                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                  {posts.map((post) => {
                    const mediaUrl = resolveMediaUrl(post.media_url);

                    return (
                      <article
                        key={post.id}
                        className="mb-3 inline-block w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45]"
                      >
                        {mediaUrl ? (
                          <Image
                            src={mediaUrl}
                            alt={post.title?.trim() || "Profile post"}
                            width={900}
                            height={680}
                            className="h-auto w-full object-cover"
                          />
                        ) : null}
                        <div className="p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                            {toReadableDate(post.created_at)}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-[rgb(var(--text-strong))]">
                            {post.title?.trim() || "Untitled update"}
                          </h3>
                          {post.content?.trim() ? (
                            <p className="mt-1 text-sm text-[rgb(var(--muted))]">{post.content.slice(0, 180)}</p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}