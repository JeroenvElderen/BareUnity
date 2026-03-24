import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getInitials, pickPostTone, pickStoryTone, relativeTime, type HomeFeedPayload } from "@/lib/homefeed";

const fallbackFeed: HomeFeedPayload = {
  stories: [],
  friends: [],
  posts: [],
  viewerId: null,
};

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function GET() {
  try {
    const viewerId = await loadViewerId();
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
            select: { content: true },
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
          OR: [{ expires_at: null }, { expires_at: { gt: now } }],
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

    const uniqueStoryAuthorIds = new Set<string>();

    const stories = storiesRaw
      .filter((post) => post.author_id)
      .filter((post) => {
        const authorId = post.author_id!;
        if (uniqueStoryAuthorIds.has(authorId)) return false;
        uniqueStoryAuthorIds.add(authorId);
        return true;
      })
      .slice(0, 8)
      .map((post, index) => {
        const name = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
        return {
          id: `${post.author_id!}-${post.id}`,
          postId: post.id,
          name,
          fallback: getInitials(name),
          tone: pickStoryTone(index),
          imageUrl: post.media_url ?? null,
          posted: relativeTime(post.created_at),
        };
      });

    const friends = friendsRaw.map((friend) => ({
      id: friend.id,
      name: friend.friend_username,
      fallback: getInitials(friend.friend_username),
      status: friend.status === "online" ? "Online" : "Offline",
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
        postType: post.post_type === "image" ? "image" : "text",
        likes,
        comments: post.comments.map((comment) => comment.content),
        likedByViewer: viewerId ? post.post_votes.some((vote) => vote.user_id === viewerId && vote.vote > 0) : false,
        tone: pickPostTone(index),
      };
    });

  const payload: HomeFeedPayload = {
      stories,
      friends,
      posts,
      viewerId,
    };
  
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Unable to load home feed", error);
    return NextResponse.json(fallbackFeed);
  }
}

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerId();

    if (!viewerId) {
      return NextResponse.json({ error: "No profile found to publish as." }, { status: 400 });
    }

    const body = (await request.json()) as {
      title?: string;
      content?: string;
      mediaUrl?: string;
      kind?: "post" | "story";
    };

    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const mediaUrl = body.mediaUrl?.trim() ?? "";
    const kind = body.kind === "story" ? "story" : "post";

    if (kind === "story") {
      if (!mediaUrl) {
        return NextResponse.json({ error: "A story image is required." }, { status: 400 });
      }

      await db.posts.create({
        data: {
          author_id: viewerId,
          title: title || "Story",
          content,
          media_url: mediaUrl,
          post_type: "story",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (!title || (!content && !mediaUrl)) {
      return NextResponse.json({ error: "A title and post content or image are required." }, { status: 400 });
    }

    await db.posts.create({
      data: {
        author_id: viewerId,
        title,
        content,
        media_url: mediaUrl || null,
        post_type: mediaUrl ? "image" : "text",
      },
    });

    return NextResponse.json({ ok: true });
    } catch (error) {
    console.error("Unable to publish to home feed", error);
    return NextResponse.json({ error: "Home feed is unavailable right now." }, { status: 503 });
  }
}