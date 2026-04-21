import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";

type LikePayload = {
  imagePath?: unknown;
  liked?: unknown;
};

function normalizeImagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  return path.length > 0 ? path : null;
}

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json({ error: "Please sign in to like gallery images." }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as LikePayload;
    const imagePath = normalizeImagePath(payload.imagePath);
    const liked = payload.liked === true;

    if (!imagePath) {
      return NextResponse.json({ error: "Missing image path." }, { status: 400 });
    }

    if (liked) {
      await db.$executeRaw(Prisma.sql`
        insert into public.gallery_image_likes (image_path, user_id)
        values (${imagePath}, ${viewerId}::uuid)
        on conflict (image_path, user_id) do nothing
      `);
    } else {
      await db.$executeRaw(Prisma.sql`
        delete from public.gallery_image_likes
        where image_path = ${imagePath}
          and user_id = ${viewerId}::uuid
      `);
    }

    const [countRow] = await db.$queryRaw<Array<{ like_count: number }>>(Prisma.sql`
      select count(*)::int as like_count
      from public.gallery_image_likes
      where image_path = ${imagePath}
    `);

    return NextResponse.json({
      imagePath,
      likeCount: Number(countRow?.like_count ?? 0),
      likedByViewer: liked,
    });
  } catch (error) {
    console.error("Unable to update gallery like", error);
    return NextResponse.json({ error: "Could not update like right now." }, { status: 503 });
  }
}