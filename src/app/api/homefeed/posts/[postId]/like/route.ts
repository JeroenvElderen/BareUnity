import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";

export async function GET(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found." }, { status: 400 });
  }

  const { postId } = await context.params;
  const post = await db.posts.findUnique({
    where: { id: postId },
    select: { author_id: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.author_id !== viewerId) {
    return NextResponse.json({ error: "Only the post owner can view likes." }, { status: 403 });
  }

  const likes = await db.post_votes.findMany({
    where: { post_id: postId, vote: { gt: 0 } },
    select: {
      user_id: true,
      profiles: {
        select: {
          username: true,
          display_name: true,
          avatar_url: true,
        },
      },
    },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json({
    likes: likes.map((like) => ({
      userId: like.user_id,
      name: like.profiles?.display_name?.trim() || like.profiles?.username || "Community member",
      avatarUrl: like.profiles?.avatar_url ?? null,
    })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for liking posts." }, { status: 400 });
  }

  const { postId } = await context.params;

  const existingVote = await db.post_votes.findUnique({
    where: {
      post_id_user_id: {
        post_id: postId,
        user_id: viewerId,
      },
    },
  });

  if (existingVote && existingVote.vote > 0) {
    await db.post_votes.delete({
      where: {
        post_id_user_id: {
          post_id: postId,
          user_id: viewerId,
        },
      },
    });

    return NextResponse.json({ liked: false });
  }

  await db.post_votes.upsert({
    where: {
      post_id_user_id: {
        post_id: postId,
        user_id: viewerId,
      },
    },
    update: {
      vote: 1,
    },
    create: {
      post_id: postId,
      user_id: viewerId,
      vote: 1,
    },
  });

  return NextResponse.json({ liked: true });
}
