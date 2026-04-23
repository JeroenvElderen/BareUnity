import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { buildProfileSnapshotPayload } from "@/lib/profile-snapshot";
import { normalizeUsername } from "@/lib/username";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json({ error: "Members only" }, { status: 401 });
    }

    const { username: rawUsername } = await context.params;
    const username = normalizeUsername(decodeURIComponent(rawUsername ?? ""));

    if (!username) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }

    let targetProfile = await db.profiles.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (!targetProfile) {
      const [normalizedMatch] = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        select p.id
        from public.profiles p
        where regexp_replace(
          regexp_replace(
            regexp_replace(lower(trim(p.username)), '[^a-z0-9_]+', '-', 'g'),
            '-{2,}',
            '-',
            'g'
          ),
          '^-+|-+$',
          '',
          'g'
        ) = ${username}
        limit 1
      `);

      if (normalizedMatch) {
        targetProfile = normalizedMatch;
      }
    }
    
    if (!targetProfile) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const payload = await buildProfileSnapshotPayload(targetProfile.id);
    return NextResponse.json(payload, {
      headers: {
        "x-bareunity-member-profile": "ok",
      },
    });
  } catch (error) {
    console.error("Unable to load member profile snapshot", error);
    return NextResponse.json({ error: "Unable to load member profile" }, { status: 503 });
  }
}