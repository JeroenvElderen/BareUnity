import HomeFeedClient from "@/components/HomeFeedClient";
import { getChannels } from "@/lib/channel-data";
import { db } from "@/server/db";

type FeedPost = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: Date | null;
  author_id: string | null;
  channel_id: string | null;
  media_url: string | null;
  post_type: string | null;
  _count: { comments: number };
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

function isPreparedStatementError(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message ?? "");
  return message.includes('code: "26000"') || message.includes("prepared statement") || message.includes("does not exist");
}

async function withPrismaRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPreparedStatementError(error)) throw error;

    await db.$disconnect();
    return operation();
  }
}

export default async function Home() {
  let posts: FeedPost[] = [];
  const channels = getChannels();
  let profile: UserProfile | null = null;
  let activityProfiles: BasicProfile[] = [];
  let authorProfiles: BasicProfile[] = [];

  try {
    const [postsResult, profileResult, activityProfilesResult] = await Promise.allSettled([
      withPrismaRetry(() =>
        db.posts.findMany({
          take: 8,
          orderBy: { created_at: "desc" },
          include: {
            _count: {
              select: {
                comments: true,
              },
            },
          },
        }),
      ),
      withPrismaRetry(() =>
        db.profiles.findFirst({
          orderBy: { created_at: "desc" },
        }),
      ),
      withPrismaRetry(() =>
        db.profiles.findMany({
          take: 3,
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            display_name: true,
            username: true,
          },
        }),
      ),
    ]);

   posts = postsResult.status === "fulfilled" ? (postsResult.value as FeedPost[]) : [];
    profile = profileResult.status === "fulfilled" ? (profileResult.value as UserProfile | null) : null;
    activityProfiles = activityProfilesResult.status === "fulfilled" ? (activityProfilesResult.value as BasicProfile[]) : [];

    const authorIds = Array.from(new Set(posts.map((post) => post.author_id).filter(Boolean))) as string[];

    if (authorIds.length) {
      authorProfiles = await withPrismaRetry(() =>
        db.profiles.findMany({
          where: {
            id: {
              in: authorIds,
            },
          },
          select: {
            id: true,
            username: true,
            display_name: true,
          },
        }),
      );
    }
  } catch (error) {
    console.error("Failed to load home feed data", error);
  }

  return <HomeFeedClient posts={posts} channels={channels} profile={profile} activityProfiles={activityProfiles} authorProfiles={authorProfiles} />;
}