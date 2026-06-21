import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { ensureMemberCanAct } from "@/lib/action-access";
import { enqueueDiscordSyncEvent, findDiscordSyncForWebsitePost } from "@/lib/discord-crosspost-sync";

export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
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
    return NextResponse.json(
      { error: "Only the post owner can view likes." },
      { status: 403 },
    );
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
      name:
        like.profiles?.display_name?.trim() ||
        like.profiles?.username ||
        "Community member",
      avatarUrl: like.profiles?.avatar_url ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json(
      { error: "No profile found for liking posts." },
      { status: 400 },
    );
  }

  const actionAccessError = await ensureMemberCanAct(viewerId);
  if (actionAccessError) return actionAccessError;

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

    const likes = await db.post_votes.count({
      where: { post_id: postId, vote: { gt: 0 } },
    });

    const sync = await findDiscordSyncForWebsitePost(postId).catch(() => null);
    if (sync?.discord_thread_id) {
      await enqueueDiscordSyncEvent({
        websitePostId: postId,
        discordThreadId: sync.discord_thread_id,
        eventType: "website_like_removed",
        dedupeKey: `website-like-removed:${postId}:${viewerId}:${Date.now()}`,
        payload: { postId, userId: viewerId, likes },
      }).catch((error) => console.error("Unable to queue Discord like removal sync", error));
    }

    return NextResponse.json({ liked: false, likes });
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
      updated_at: new Date(),
    },
    create: {
      post_id: postId,
      user_id: viewerId,
      vote: 1,
    },
  });

  const likes = await db.post_votes.count({
    where: { post_id: postId, vote: { gt: 0 } },
  });

  const sync = await findDiscordSyncForWebsitePost(postId).catch(() => null);
  if (sync?.discord_thread_id) {
    await enqueueDiscordSyncEvent({
      websitePostId: postId,
      discordThreadId: sync.discord_thread_id,
      eventType: "website_like_created",
      dedupeKey: `website-like-created:${postId}:${viewerId}:${Date.now()}`,
      payload: { postId, userId: viewerId, likes },
    }).catch((error) => console.error("Unable to queue Discord like sync", error));
  }

  return NextResponse.json({ liked: true, likes });
}
