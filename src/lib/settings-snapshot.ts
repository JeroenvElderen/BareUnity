import { findAccountSettingsSnapshot } from "@/lib/profile-settings-compat";
import { normalizeSettingOptionStates } from "@/lib/settings-controls";
import { db } from "@/server/db";

export type SettingsSnapshotPayload = {
  username: string;
  email: string;
  hasRecoveryKeys: boolean;
  addPostImagesToGallery: boolean;
  optionStates: Record<string, string>;
};

export const EMPTY_SETTINGS_SNAPSHOT: SettingsSnapshotPayload = {
  username: "member",
  email: "member@example.com",
  hasRecoveryKeys: false,
  addPostImagesToGallery: true,
  optionStates: {},
};

export async function buildSettingsSnapshotPayload(
  userId: string,
): Promise<SettingsSnapshotPayload> {
  const [userRow, profileRow, profileSettingsRow] = await Promise.all([
    db.users.findUnique({ where: { id: userId }, select: { email: true } }),
    db.profiles.findUnique({
      where: { id: userId },
      select: { username: true },
    }),
    findAccountSettingsSnapshot(userId),
  ]);

  return {
    username: profileRow?.username?.trim() || EMPTY_SETTINGS_SNAPSHOT.username,
    email: userRow?.email?.trim() || EMPTY_SETTINGS_SNAPSHOT.email,
    hasRecoveryKeys:
      Array.isArray(profileSettingsRow?.recovery_keys) &&
      profileSettingsRow.recovery_keys.length > 0,
    addPostImagesToGallery:
      profileSettingsRow?.add_post_images_to_gallery ??
      EMPTY_SETTINGS_SNAPSHOT.addPostImagesToGallery,
    optionStates: normalizeSettingOptionStates(
      profileSettingsRow?.setting_control_states,
    ),
  };
}

export async function getSettingsSnapshotSourceVersion(
  userId: string,
): Promise<string> {
  const [userRow, profileRow, settingsRow] = await Promise.all([
    db.users.findUnique({
      where: { id: userId },
      select: { email: true, updated_at: true },
    }),
    db.profiles.findUnique({
      where: { id: userId },
      select: { username: true },
    }),
    findAccountSettingsSnapshot(userId),
  ]);

  return JSON.stringify({
    email: userRow?.email ?? null,
    userUpdatedAt: userRow?.updated_at?.toISOString() ?? null,
    username: profileRow?.username ?? null,
    settingsUpdatedAt: settingsRow?.updated_at?.toISOString() ?? null,
    addPostImagesToGallery: settingsRow?.add_post_images_to_gallery ?? null,
    optionStates: normalizeSettingOptionStates(
      settingsRow?.setting_control_states,
    ),
    hasRecoveryKeys:
      Array.isArray(settingsRow?.recovery_keys) &&
      settingsRow.recovery_keys.length > 0,
  });
}
