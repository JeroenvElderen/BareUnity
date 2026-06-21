import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { ensureMemberCanAct } from "@/lib/action-access";
import { enqueueDiscordSyncEvent, findDiscordSyncForWebsitePost } from "@/lib/discord-crosspost-sync";

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json(
      { error: "No profile found for commenting." },
      { status: 400 },
    );
  }

  const actionAccessError = await ensureMemberCanAct(viewerId);
  if (actionAccessError) return actionAccessError;

  const { postId } = await context.params;
  const body = (await request.json()) as {
    content?: string;
    parentId?: string | null;
  };

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json(
      { error: "Comment content is required." },
      { status: 400 },
    );
  }

  const parentId = body.parentId?.trim() || null;
  if (parentId) {
    const parentComment = await db.comments.findUnique({
      where: { id: parentId },
      select: { id: true, post_id: true },
    });

    if (!parentComment || parentComment.post_id !== postId) {
      return NextResponse.json(
        { error: "Parent comment not found for this post." },
        { status: 400 },
      );
    }
  }

  const comment = await db.comments.create({
    data: {
      post_id: postId,
      author_id: viewerId,
      parent_id: parentId,
      content,
    },
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
  });

  const authorName =
    comment.profiles?.display_name?.trim() ||
    comment.profiles?.username ||
    "Community member";
  const authorFallback =
    authorName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "BU";

  const sync = await findDiscordSyncForWebsitePost(postId).catch(() => null);
  if (sync?.discord_thread_id) {
    await enqueueDiscordSyncEvent({
      websitePostId: postId,
      discordThreadId: sync.discord_thread_id,
      eventType: "website_comment_created",
      dedupeKey: `website-comment:${comment.id}`,
      payload: {
        postId,
        commentId: comment.id,
        parentId: comment.parent_id ?? null,
        content: comment.content,
        authorId: comment.author_id,
        authorName,
      },
    }).catch((error) => console.error("Unable to queue Discord comment sync", error));
  }

  return NextResponse.json({
    comment: {
      id: comment.id,
      content: comment.content,
      authorId: comment.author_id,
      authorName,
      authorFallback,
      authorAvatarUrl: comment.profiles?.avatar_url ?? null,
      parentId: comment.parent_id ?? null,
    },
  });
}
