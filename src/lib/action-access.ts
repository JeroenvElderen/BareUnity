import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { db } from "@/server/db";

export const VIEW_ONLY_ACTION_ERROR =
  "Your Visitor Pass lets you browse and preview BareUnity, but posting, messaging, friend requests, check-ins, and submissions require ID verification.";

type ActionAccessRow = {
  onboarding_completed: boolean | null;
  user_role: string | null;
  email: string | null;
};

export async function canUseMemberActions(userId: string) {
  const rows = await db.$queryRaw<ActionAccessRow[]>(Prisma.sql`
    select ps.onboarding_completed, ps.user_role, u.email
    from auth.users u
    left join public.profile_settings ps on ps.user_id = u.id
    where u.id = ${userId}::uuid
    limit 1
  `);

  const settings = rows[0];
  if (!settings) return false;
  if (isPlatformAdminEmail(settings.email)) return true;
  if (settings.user_role === "view_only") return false;
  return settings.onboarding_completed === true;
}

export async function ensureMemberCanAct(userId: string) {
  if (await canUseMemberActions(userId)) return null;

  return NextResponse.json({ error: VIEW_ONLY_ACTION_ERROR }, { status: 403 });
}
