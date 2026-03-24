import { NextResponse } from "next/server";
import { db } from "@/server/db";

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function POST(_: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerId();
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