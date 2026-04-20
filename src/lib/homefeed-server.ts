import { db } from "@/server/db";
import { getInitials, pickPostTone, pickStoryTone, relativeTime, type HomeFeedPayload } from "@/lib/homefeed";

export const fallbackFeed: HomeFeedPayload = {
  stories: [],
  friends: [],
  posts: [],
  viewerId: null,
};

export async function getHomeFeedSourceVersion(viewerId: string) {
  const [latestPost, latestComment, latestVote, latestFriendship] = await Promise.all([
    db.posts.findFirst({
      where: {
        OR: [{ channel_id: null }, { channels: { is: { is_enabled: true } } }],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
    db.comments.findFirst({
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
    db.post_votes.findFirst({
      orderBy: { updated_at: "desc" },
      select: { id: true, updated_at: true },
    }),
    db.friendships.findFirst({
      where: { user_id: viewerId },
      orderBy: { created_at: "desc" },
      select: { id: true, created_at: true },
    }),
  ]);

  return [
    latestPost?.id ?? "-",
    latestPost?.created_at?.toISOString() ?? "-",
    latestComment?.id ?? "-",
    latestComment?.created_at?.toISOString() ?? "-",
    latestVote?.id ?? "-",
    latestVote?.updated_at?.toISOString() ?? "-",
    latestFriendship?.id ?? "-",
    latestFriendship?.created_at?.toISOString() ?? "-",
  ].join("|");
}

export async function buildHomeFeedPayload(viewerId: string | null): Promise<HomeFeedPayload> {
  const now = new Date();

  const [postsRaw, friendsRaw, storiesRaw] = await Promise.all([
    db.posts.findMany({
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
          select: { id: true, content: true, author_id: true },
          orderBy: { created_at: "asc" },
        },
        post_votes: {
          select: { user_id: true, vote: true },
        },
      },
    }),
    viewerId
      ? db.friendships.findMany({
          where: { user_id: viewerId },
          orderBy: { created_at: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
    db.posts.findMany({
      where: {
        post_type: "story",
        author_id: { not: null },
        media_url: { not: null },
        expires_at: { gt: now },
      },
      orderBy: { created_at: "desc" },
      take: 20,
      include: {
        profiles: {
          select: { username: true, display_name: true },
        },
      },
    }),
  ]);

  const stories = storiesRaw
    .filter((post) => post.author_id)
    .map((post, index) => {
      const name = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
      return {
        id: `${post.author_id!}-${post.id}`,
        postId: post.id,
        authorId: post.author_id!,
        name,
        fallback: getInitials(name),
        tone: pickStoryTone(index),
        imageUrl: post.media_url ?? null,
        posted: relativeTime(post.created_at),
        createdAt: post.created_at.toISOString(),
      };
    });

  const friends = friendsRaw.map((friend) => ({
    id: friend.id,
    name: friend.friend_username,
    fallback: getInitials(friend.friend_username),
    status: (friend.status === "online" ? "Online" : "Offline") as "Online" | "Offline",
  }));

  const posts = postsRaw.map((post, index) => {
    const author = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
    const likes = post.post_votes.filter((vote) => vote.vote > 0).length;

    return {
      id: post.id,
      author,
      fallback: getInitials(author),
      posted: relativeTime(post.created_at),
      text: [post.title?.trim(), post.content?.trim()].filter(Boolean).join("\n") || "Shared an update",
      mediaUrl: post.media_url ?? null,
      postType: (post.post_type === "image" ? "image" : "text") as "image" | "text",
      likes,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        authorId: comment.author_id ?? null,
      })),
      likedByViewer: viewerId ? post.post_votes.some((vote) => vote.user_id === viewerId && vote.vote > 0) : false,
      tone: pickPostTone(index),
      authorId: post.author_id ?? null,
    };
  });

  return {
    stories,
    friends,
    posts,
    viewerId,
  };
}