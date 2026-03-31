import { NextResponse } from "next/server";

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

    const targetProfile = await db.profiles.findUnique({
      where: { username },
      select: { id: true },
    });

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