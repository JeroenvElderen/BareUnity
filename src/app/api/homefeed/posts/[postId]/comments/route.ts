import { NextResponse } from "next/server";
import { db } from "@/server/db";

async function loadViewerId() {
  const viewer = await db.profiles.findFirst({
    select: { id: true },
    orderBy: { created_at: "desc" },
  });

  return viewer?.id ?? null;
}

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerId();
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for commenting." }, { status: 400 });
  }

  const { postId } = await context.params;
  const body = (await request.json()) as { content?: string };

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "Comment content is required." }, { status: 400 });
  }

  await db.comments.create({
    data: {
      post_id: postId,
      author_id: viewerId,
      content,
    },
  });

  return NextResponse.json({ ok: true });
}