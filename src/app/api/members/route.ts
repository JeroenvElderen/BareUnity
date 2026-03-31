import { NextResponse } from "next/server";

import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type MemberListItem = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
};

export async function GET(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json({ error: "Members only" }, { status: 401 });
    }

    const members = await db.profiles.findMany({
      select: {
        id: true,
        username: true,
        display_name: true,
        bio: true,
        avatar_url: true,
        location: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 120,
    });

    const payload: MemberListItem[] = members.filter((member) => Boolean(member.username?.trim()));

    return NextResponse.json({ members: payload }, {
      headers: {
        "x-bareunity-members": "ok",
      },
    });
  } catch (error) {
    console.error("Unable to load members", error);
    return NextResponse.json({ error: "Unable to load members" }, { status: 503 });
  }
}