import { db } from "@/server/db";
import { getInitials, pickPostTone, pickStoryTone, relativeTime, type HomeFeedPayload } from "@/lib/homefeed";
import { resolveMediaUrl } from "@/lib/media-url";

export const fallbackFeed: HomeFeedPayload = {
  stories: [],
  posts: [],
  viewerId: null,
};

export async function getHomeFeedSourceVersion(viewerId: string) {
  void viewerId;
  // Keep these queries sequential so the endpoint remains stable in constrained
  // environments (for example local dev databases configured with connection_limit=1).
  const latestPost = await db.posts.findFirst({
    where: {
      OR: [{ channel_id: null }, { channels: { is: { is_enabled: true } } }],
    },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });

  const latestComment = await db.comments.findFirst({
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });

  const latestVote = await db.post_votes.findFirst({
    orderBy: { updated_at: "desc" },
    select: { id: true, updated_at: true },
  });

  const postCount = await db.posts.count({
    where: {
      OR: [{ channel_id: null }, { channels: { is: { is_enabled: true } } }],
    },
  });

  const commentCount = await db.comments.count();
  const voteCount = await db.post_votes.count();

  return [
    latestPost?.id ?? "-",
    latestPost?.created_at?.toISOString() ?? "-",
    latestComment?.id ?? "-",
    latestComment?.created_at?.toISOString() ?? "-",
    latestVote?.id ?? "-",
    latestVote?.updated_at?.toISOString() ?? "-",
    postCount,
    commentCount,
    voteCount,
  ].join("|");
}

export async function buildHomeFeedPayload(viewerId: string | null): Promise<HomeFeedPayload> {
  const now = new Date();

  // Keep runtime queries sequential. Production uses the Supabase pooler with
  // connection_limit=1, so parallel Prisma operations can exhaust the single
  // client-side connection and surface as intermittent homefeed timeouts.
  const postsRaw = await db.posts.findMany({
    take: 20,
    orderBy: { created_at: "desc" },
    where: {
      post_type: { not: "story" },
      OR: [{ channel_id: null }, { channels: { is: { is_enabled: true } } }],
    },
    include: {
      profiles: {
        select: { username: true, display_name: true },
      },
      comments: {
        select: {
          id: true,
          content: true,
          author_id: true,
          parent_id: true,
          profiles: {
            select: {
              username: true,
              display_name: true,
              avatar_url: true,
            },
          },
        },
        orderBy: { created_at: "asc" },
      },
      post_votes: {
        select: { user_id: true, vote: true },
      },
    },
  });

  const storiesRaw = await db.posts.findMany({
    where: {
      post_type: "story",
      author_id: { not: null },
      media_url: { not: null },
      expires_at: { gt: now },
    },
    orderBy: { created_at: "asc" },
    take: 20,
    include: {
      profiles: {
        select: { username: true, display_name: true },
      },
    },
  });

  const stories = storiesRaw
    .filter((post) => post.author_id)
    .map((post, index) => {
      const createdAt = post.created_at ?? now;
      const name = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
      return {
        id: `${post.author_id!}-${post.id}`,
        postId: post.id,
        authorId: post.author_id!,
        name,
        fallback: getInitials(name),
        tone: pickStoryTone(index),
        imageUrl: resolveMediaUrl(post.media_url),
        posted: relativeTime(createdAt),
        createdAt: createdAt.toISOString(),
      };
    });

  const posts = postsRaw.map((post, index) => {
    const author = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
    const likes = post.post_votes.filter((vote) => vote.vote > 0).length;

    return {
      id: post.id,
      author,
      fallback: getInitials(author),
      posted: relativeTime(post.created_at),
      text: [post.title?.trim(), post.content?.trim()].filter(Boolean).join("\n") || "Shared an update",
      mediaUrl: resolveMediaUrl(post.media_url),
      postType: (post.post_type === "image" ? "image" : "text") as "image" | "text",
      likes,
      comments: post.comments.map((comment) => {
        const commentAuthorName = comment.profiles?.display_name?.trim() || comment.profiles?.username || "Community member";
        return {
          id: comment.id,
          content: comment.content,
          authorId: comment.author_id ?? null,
          authorName: commentAuthorName,
          authorFallback: getInitials(commentAuthorName),
          authorAvatarUrl: comment.profiles?.avatar_url ?? null,
          parentId: comment.parent_id ?? null,
        };
      }),
      likedByViewer: viewerId ? post.post_votes.some((vote) => vote.user_id === viewerId && vote.vote > 0) : false,
      tone: pickPostTone(index),
      authorId: post.author_id ?? null,
    };
  });

  return {
    stories,
    posts,
    viewerId,
  };
}