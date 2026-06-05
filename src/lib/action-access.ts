import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { db } from "@/server/db";

export const VIEW_ONLY_ACTION_ERROR =
  "Your Visitor Pass lets you browse and preview BareUnity, but posting, check-ins, and submissions require ID verification.";

export const PROFILE_UPDATE_VISITOR_ERROR =
  "Your Visitor Pass lets you browse and preview BareUnity, but profile editing requires invite or ID verification.";

type ActionAccessRow = {
  onboarding_completed: boolean | null;
  user_role: string | null;
  email: string | null;
};

type ProfileUpdateAccessRow = {
  user_role: string | null;
  email: string | null;
  account_access: string | null;
  onboarding_level: string | null;
  verification_status: string | null;
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

export async function canUpdateOwnProfile(userId: string) {
  const rows = await db.$queryRaw<ProfileUpdateAccessRow[]>(Prisma.sql`
    select
      ps.user_role,
      u.email,
      u.raw_user_meta_data ->> 'account_access' as account_access,
      u.raw_user_meta_data ->> 'onboarding_level' as onboarding_level,
      u.raw_user_meta_data ->> 'verification_status' as verification_status
    from auth.users u
    left join public.profile_settings ps on ps.user_id = u.id
    where u.id = ${userId}::uuid
    limit 1
  `);

  const settings = rows[0];
  if (!settings) return false;
  if (isPlatformAdminEmail(settings.email)) return true;

  const userRole = settings.user_role?.trim().toLowerCase() ?? "";
  const accountAccess = settings.account_access?.trim().toLowerCase() ?? "";
  const onboardingLevel = settings.onboarding_level?.trim().toLowerCase() ?? "";
  const verificationStatus = settings.verification_status?.trim().toLowerCase() ?? "";

  if (userRole === "view_only") return false;
  if (accountAccess === "viewonly" || accountAccess === "view_only") return false;
  if (onboardingLevel === "view_only_unverified" || verificationStatus === "unverified") return false;

  return true;
}

export async function ensureCanUpdateOwnProfile(userId: string) {
  if (await canUpdateOwnProfile(userId)) return null;

  return NextResponse.json({ error: PROFILE_UPDATE_VISITOR_ERROR }, { status: 403 });
}
