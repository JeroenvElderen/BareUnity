import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/server/db";

export const VIEW_ONLY_ACTION_ERROR =
  "Your account is view-only until ID verification is approved. You can browse, but actions are locked.";

type ActionAccessRow = {
  onboarding_completed: boolean | null;
  user_role: string | null;
};

export async function canUseMemberActions(userId: string) {
  const rows = await db.$queryRaw<ActionAccessRow[]>(Prisma.sql`
    select onboarding_completed, user_role
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  const settings = rows[0];
  if (!settings) return false;
  if (settings.user_role === "view_only") return false;
  return settings.onboarding_completed === true;
}

export async function ensureMemberCanAct(userId: string) {
  if (await canUseMemberActions(userId)) return null;

  return NextResponse.json({ error: VIEW_ONLY_ACTION_ERROR }, { status: 403 });
}
