import { findAccountSettingsSnapshot } from "@/lib/profile-settings-compat";
import { db } from "@/server/db";

export type SettingsSnapshotPayload = {
  username: string;
  email: string;
  recoveryKeys: string[];
  addPostImagesToGallery: boolean;
  optionStates: Record<string, string>;
};

export const EMPTY_SETTINGS_SNAPSHOT: SettingsSnapshotPayload = {
  username: "member",
  email: "member@example.com",
  recoveryKeys: [],
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
    recoveryKeys: Array.isArray(profileSettingsRow?.recovery_keys)
      ? profileSettingsRow.recovery_keys.filter(
          (key): key is string => typeof key === "string",
        )
      : EMPTY_SETTINGS_SNAPSHOT.recoveryKeys,
    addPostImagesToGallery:
      profileSettingsRow?.add_post_images_to_gallery ??
      EMPTY_SETTINGS_SNAPSHOT.addPostImagesToGallery,
    optionStates:
      profileSettingsRow?.setting_control_states &&
      typeof profileSettingsRow.setting_control_states === "object" &&
      !Array.isArray(profileSettingsRow.setting_control_states)
        ? (profileSettingsRow.setting_control_states as Record<string, string>)
        : EMPTY_SETTINGS_SNAPSHOT.optionStates,
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
    optionStates: settingsRow?.setting_control_states ?? {},
    recoveryKeys: settingsRow?.recovery_keys ?? [],
  });
}
