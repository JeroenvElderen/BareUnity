import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for commenting." }, { status: 400 });
  }

  const { postId } = await context.params;
  const body = (await request.json()) as { content?: string };

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "Comment content is required." }, { status: 400 });
  }

  const comment = await db.comments.create({
    data: {
      post_id: postId,
      author_id: viewerId,
      content,
    },
    select: {
      id: true,
      content: true,
      author_id: true,
    },
  });

  return NextResponse.json({
    comment: {
      id: comment.id,
      content: comment.content,
      authorId: comment.author_id,
    },
  });
}
