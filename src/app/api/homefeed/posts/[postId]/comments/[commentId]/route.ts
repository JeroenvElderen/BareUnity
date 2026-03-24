import { NextResponse } from "next/server";
import { db } from "@/server/db";

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function DELETE(_: Request, context: { params: Promise<{ postId: string; commentId: string }> }) {
  const viewerId = await loadViewerId();
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for deleting comments." }, { status: 400 });
  }

  const { postId, commentId } = await context.params;

  const comment = await db.comments.findUnique({
    where: { id: commentId },
    select: { id: true, post_id: true, author_id: true },
  });

  if (!comment || comment.post_id !== postId) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  if (comment.author_id !== viewerId) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  await db.comments.delete({ where: { id: commentId } });

  return NextResponse.json({ ok: true });
}