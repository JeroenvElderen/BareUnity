import { db } from "@/server/db";

export type ProfileSnapshotProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
};

export type ProfileSnapshotPost = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  created_at: string | null;
  post_type: string | null;
};

export type ProfileSnapshotPayload = {
  profile: ProfileSnapshotProfile | null;
  posts: ProfileSnapshotPost[];
  interests: string[];
  stats: { posts: number; friends: number; comments: number };
};

export const EMPTY_PROFILE_SNAPSHOT: ProfileSnapshotPayload = {
  profile: null,
  posts: [],
  interests: [],
  stats: { posts: 0, friends: 0, comments: 0 },
};

export async function buildProfileSnapshotPayload(userId: string): Promise<ProfileSnapshotPayload> {
  const profile = await db.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      display_name: true,
      bio: true,
      avatar_url: true,
      location: true,
    },
  });

  if (!profile) return EMPTY_PROFILE_SNAPSHOT;

  const [posts, settings, postsCount, friendsCount, commentsCount] = await Promise.all([
    db.posts.findMany({
      where: {
        author_id: profile.id,
        OR: [{ post_type: null }, { post_type: { not: "story" } }],
      },
      select: {
        id: true,
        title: true,
        content: true,
        media_url: true,
        created_at: true,
        post_type: true,
      },
      orderBy: { created_at: "desc" },
      take: 30,
    }),
    db.profile_settings.findUnique({
      where: { user_id: profile.id },
      select: { interests: true },
    }),
    db.posts.count({
      where: {
        author_id: profile.id,
        OR: [{ post_type: null }, { post_type: { not: "story" } }],
      },
    }),
    db.friendships.count({
      where: { user_id: profile.id },
    }),
    db.comments.count({
      where: { author_id: profile.id },
    }),
  ]);

  return {
    profile,
    posts: posts.map((post) => ({
      ...post,
      created_at: post.created_at?.toISOString() ?? null,
    })),
    interests: (settings?.interests ?? []).slice(0, 8),
    stats: {
      posts: postsCount,
      friends: friendsCount,
      comments: commentsCount,
    },
  };
}

export async function getProfileSnapshotSourceVersion(userId: string): Promise<string> {
  const [profile, latestPost, latestFriendship, latestComment, settings] = await Promise.all([
    db.profiles.findUnique({
      where: { id: userId },
      select: { id: true, username: true, display_name: true, bio: true, avatar_url: true, location: true },
    }),
    db.posts.findFirst({
      where: {
        author_id: userId,
        OR: [{ post_type: null }, { post_type: { not: "story" } }],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
    db.friendships.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
    db.comments.findFirst({
      where: { author_id: userId },
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
    db.profile_settings.findUnique({
      where: { user_id: userId },
      select: { updated_at: true, interests: true },
    }),
  ]);

  return JSON.stringify({
    profile,
    latestPostId: latestPost?.id ?? null,
    latestPostCreatedAt: latestPost?.created_at?.toISOString() ?? null,
    latestFriendshipId: latestFriendship?.id ?? null,
    latestFriendshipCreatedAt: latestFriendship?.created_at?.toISOString() ?? null,
    latestCommentId: latestComment?.id ?? null,
    latestCommentCreatedAt: latestComment?.created_at?.toISOString() ?? null,
    settingsUpdatedAt: settings?.updated_at?.toISOString() ?? null,
    interests: settings?.interests ?? [],
  });
}
