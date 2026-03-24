import { NextResponse } from "next/server";
import { db } from "@/server/db";

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerId();
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for editing posts." }, { status: 400 });
  }

  const { postId } = await context.params;
  const body = (await request.json()) as { title?: string; content?: string };
  const title = body.title?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  
  if (!title && !content) {
    return NextResponse.json({ error: "Updated title or content is required." }, { status: 400 });
  }

  const post = await db.posts.findUnique({
    where: { id: postId },
    select: { id: true, author_id: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.author_id !== viewerId) {
    return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
  }

  await db.posts.update({
    where: { id: postId },
    data: {
      title: title || null,
      content: content || null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerId();
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for deleting posts." }, { status: 400 });
  }

  const { postId } = await context.params;

  const post = await db.posts.findUnique({
    where: { id: postId },
    select: { id: true, author_id: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.author_id !== viewerId) {
    return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  }

  await db.posts.delete({ where: { id: postId } });

  return NextResponse.json({ ok: true });
}