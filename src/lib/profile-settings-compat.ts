import { Prisma } from "@prisma/client";

import { db } from "@/server/db";

export type ProfileSettingsControlsRow = {
  interests: string[] | null;
  setting_control_states: Prisma.JsonValue | null;
};

export type ProfileSettingsSnapshotRow = ProfileSettingsControlsRow & {
  updated_at: Date | null;
};

export type GalleryPreferenceRow = {
  user_id: string;
  add_post_images_to_gallery: boolean | null;
};

export type AccountSettingsSnapshotRow = {
  recovery_keys: Prisma.JsonValue | null;
  add_post_images_to_gallery: boolean | null;
  setting_control_states: Prisma.JsonValue | null;
  updated_at: Date | null;
};

/**
 * Reads settings columns that are newer than some checked-in/generated Prisma
 * clients. The deployed database schema contains these columns, but a stale
 * generated client rejects them during select validation before a query reaches
 * the database. Raw SQL keeps snapshot routes working until every environment
 * has regenerated its Prisma client.
 */
export async function findProfileSettingsControls(
  userId: string,
): Promise<ProfileSettingsControlsRow | null> {
  const rows = await db.$queryRaw<ProfileSettingsControlsRow[]>(Prisma.sql`
    select interests, setting_control_states
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function findProfileSettingsSnapshot(
  userId: string,
): Promise<ProfileSettingsSnapshotRow | null> {
  const rows = await db.$queryRaw<ProfileSettingsSnapshotRow[]>(Prisma.sql`
    select updated_at, interests, setting_control_states
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function findAccountSettingsSnapshot(
  userId: string,
): Promise<AccountSettingsSnapshotRow | null> {
  const rows = await db.$queryRaw<AccountSettingsSnapshotRow[]>(Prisma.sql`
    select
      recovery_keys,
      add_post_images_to_gallery,
      setting_control_states,
      updated_at
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function findGalleryPreferences(
  userIds: string[],
): Promise<GalleryPreferenceRow[]> {
  if (!userIds.length) return [];

  return db.$queryRaw<GalleryPreferenceRow[]>(Prisma.sql`
    select user_id, add_post_images_to_gallery
    from public.profile_settings
    where user_id in (${Prisma.join(userIds.map((userId) => Prisma.sql`${userId}::uuid`))})
  `);
}