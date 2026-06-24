import { NextResponse } from "next/server";

import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { loadViewerFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type MemberListItem = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  is_verified: boolean;
};

export async function GET(request: Request) {
  try {
    const viewer = await loadViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ error: "Members only" }, { status: 401 });
    }

    if (!isPlatformAdminEmail(viewer.email)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
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

    const visibleMembers = members.filter((member) =>
      Boolean(member.username?.trim()),
    );
    const accountSettings = await db.profile_settings.findMany({
      where: {
        user_id: {
          in: visibleMembers.map((member) => member.id),
        },
      },
      select: {
        user_id: true,
        onboarding_completed: true,
        user_role: true,
      },
    });
    const settingsByUserId = new Map(
      accountSettings.map((settings) => [settings.user_id, settings]),
    );

    const payload: MemberListItem[] = visibleMembers.map((member) => {
      const settings = settingsByUserId.get(member.id);
      const role = settings?.user_role?.trim().toLowerCase() ?? "";

      return {
        ...member,
        is_verified:
          settings?.onboarding_completed === true && role !== "view_only",
      };
    });

    return NextResponse.json(
      { members: payload },
      {
        headers: {
          "x-bareunity-members": "ok",
        },
      },
    );
  } catch (error) {
    console.error("Unable to load members", error);
    return NextResponse.json(
      { error: "Unable to load members" },
      { status: 503 },
    );
  }
}
