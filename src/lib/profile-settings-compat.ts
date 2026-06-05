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

const PROFILE_SETTINGS_TABLE = "profile_settings";
const REQUIRED_PROFILE_SETTINGS_COLUMNS = [
  "interests",
  "setting_control_states",
  "recovery_keys",
  "add_post_images_to_gallery",
  "updated_at",
] as const;

type ProfileSettingsColumn = (typeof REQUIRED_PROFILE_SETTINGS_COLUMNS)[number];

let profileSettingsColumnsPromise: Promise<Set<string>> | null = null;

async function getProfileSettingsColumns() {
  profileSettingsColumnsPromise ??= db
    .$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${PROFILE_SETTINGS_TABLE}
        and column_name in (${Prisma.join([...REQUIRED_PROFILE_SETTINGS_COLUMNS])})
    `)
    .then((rows) => new Set(rows.map((row) => row.column_name)));

  return profileSettingsColumnsPromise;
}

async function hasProfileSettingsColumn(column: ProfileSettingsColumn) {
  return (await getProfileSettingsColumns()).has(column);
}

function maybeColumn(
  columns: Set<string>,
  column: ProfileSettingsColumn,
  fallback: string,
) {
  return columns.has(column) ? Prisma.raw(column) : Prisma.raw(fallback);
}

/**
 * Reads settings columns that are newer than some checked-in/generated Prisma
 * clients. The deployed database schema contains these columns in healthy
 * environments, but partial migrations can leave one or more absent. Raw SQL
 * plus information_schema guards keep snapshot routes returning safe defaults
 * instead of failing with 503s while migrations catch up.
 */
export async function findProfileSettingsControls(
  userId: string,
): Promise<ProfileSettingsControlsRow | null> {
  const columns = await getProfileSettingsColumns();
  const rows = await db.$queryRaw<ProfileSettingsControlsRow[]>(Prisma.sql`
    select
      ${maybeColumn(columns, "interests", "null::text[]")} as interests,
      ${maybeColumn(columns, "setting_control_states", "null::jsonb")} as setting_control_states
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function findProfileSettingsSnapshot(
  userId: string,
): Promise<ProfileSettingsSnapshotRow | null> {
  const columns = await getProfileSettingsColumns();
  const rows = await db.$queryRaw<ProfileSettingsSnapshotRow[]>(Prisma.sql`
    select
      ${maybeColumn(columns, "updated_at", "null::timestamptz")} as updated_at,
      ${maybeColumn(columns, "interests", "null::text[]")} as interests,
      ${maybeColumn(columns, "setting_control_states", "null::jsonb")} as setting_control_states
    from public.profile_settings
    where user_id = ${userId}::uuid
    limit 1
  `);

  return rows[0] ?? null;
}

export async function findAccountSettingsSnapshot(
  userId: string,
): Promise<AccountSettingsSnapshotRow | null> {
  const columns = await getProfileSettingsColumns();
  const rows = await db.$queryRaw<AccountSettingsSnapshotRow[]>(Prisma.sql`
    select
      ${maybeColumn(columns, "recovery_keys", "null::jsonb")} as recovery_keys,
      ${maybeColumn(columns, "add_post_images_to_gallery", "true")} as add_post_images_to_gallery,
      ${maybeColumn(columns, "setting_control_states", "null::jsonb")} as setting_control_states,
      ${maybeColumn(columns, "updated_at", "null::timestamptz")} as updated_at
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
  if (!(await hasProfileSettingsColumn("add_post_images_to_gallery"))) {
    return [];
  }

  return db.$queryRaw<GalleryPreferenceRow[]>(Prisma.sql`
    select user_id, add_post_images_to_gallery
    from public.profile_settings
    where user_id in (${Prisma.join(userIds.map((userId) => Prisma.sql`${userId}::uuid`))})
  `);
}