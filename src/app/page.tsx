import HomeFeedClient from "@/components/HomeFeedClient";
import { ChannelContentType, getChannels } from "@/lib/channel-data";
import { db } from "@/server/db";
import { Prisma } from "@prisma/client";

type FeedPost = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: Date | null;
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
};

function normalizeContentType(raw: string | null): ChannelContentType {
  if (raw === "retreats") return "retreats";
  if (raw === "mindful") return "mindful";
  if (raw === "map" || raw === "naturist-map" || raw === "naturist_map") return "map";
  if (raw === "discussion") return "discussion";
  if (raw === "custom") return "custom";
  return "general";
}

function isPreparedStatementError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) return false;

  return error.message.includes('code: "26000"') || error.message.includes("prepared statement") || error.message.includes("does not exist");
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
  let channels: SidebarChannel[] = [];
  let profile: UserProfile | null = null;
  let activityProfiles: BasicProfile[] = [];
  let authorProfiles: BasicProfile[] = [];

  try {
    const [postsResult, channelsResult, profileResult, activityProfilesResult] = await Promise.allSettled([
      withPrismaRetry(() =>
        db.posts.findMany({
          take: 8,
          orderBy: { created_at: "desc" },
          include: {
            channels: {
              select: {
                name: true,
              },
            },
            _count: {
              select: {
                comments: true,
              },
            },
          },
        }),
      ),
      withPrismaRetry(() =>
        db.channels.findMany({
          where: { is_enabled: true },
          orderBy: [{ featured: "desc" }, { position: "asc" }, { created_at: "desc" }],
          take: 5,
          select: {
            id: true,
            name: true,
            icon_url: true,
            content_type: true,
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

    posts = postsResult.status === "fulfilled" ? postsResult.value : [];
    channels =
      channelsResult.status === "fulfilled"
        ? channelsResult.value.map((channel) => ({
            id: channel.id,
            name: channel.name,
            iconUrl: channel.icon_url,
            contentType: normalizeContentType(channel.content_type),
          }))
        : getChannels();
    profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    activityProfiles = activityProfilesResult.status === "fulfilled" ? activityProfilesResult.value : [];

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