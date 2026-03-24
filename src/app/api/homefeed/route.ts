import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getInitials, pickPostTone, pickStoryTone, relativeTime, type HomeFeedPayload } from "@/lib/homefeed";

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function GET() {
  const viewerId = await loadViewerId();

  const [postsRaw, friendsRaw, storyAuthorsRaw] = await Promise.all([
    db.posts.findMany({
      take: 20,
      orderBy: { created_at: "desc" },
      where: {
        OR: [
          { channel_id: null },
          { channels: { is_enabled: true } },
        ],
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
      distinct: ["author_id"],
      where: { author_id: { not: null } },
      orderBy: { created_at: "desc" },
      take: 8,
      include: {
        profiles: {
          select: { username: true, display_name: true },
        },
      },
    }),
  ]);

  const stories = storyAuthorsRaw
    .filter((post) => post.author_id)
    .map((post, index) => {
      const name = post.profiles?.display_name?.trim() || post.profiles?.username || "Community member";
      return {
        id: post.author_id!,
        name,
        fallback: getInitials(name),
        tone: pickStoryTone(index),
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
}

export async function POST(request: Request) {
  const viewerId = await loadViewerId();

  if (!viewerId) {
    return NextResponse.json({ error: "No profile found to publish as." }, { status: 400 });
  }

  const body = (await request.json()) as { title?: string; content?: string };

  const title = body.title?.trim() ?? "";
  const content = body.content?.trim() ?? "";

  if (!title || !content) {
    return NextResponse.json({ error: "A title and content are required." }, { status: 400 });
  }

  await db.posts.create({
    data: {
      author_id: viewerId,
      title,
      content,
      post_type: "text",
    },
  });

  return NextResponse.json({ ok: true });
}