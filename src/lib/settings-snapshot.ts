import { db } from "@/server/db";

export type SettingsSnapshotPayload = {
  username: string;
  email: string;
  recoveryKeys: string[];
};

export const EMPTY_SETTINGS_SNAPSHOT: SettingsSnapshotPayload = {
  username: "member",
  email: "member@example.com",
  recoveryKeys: [],
};

export async function buildSettingsSnapshotPayload(userId: string): Promise<SettingsSnapshotPayload> {
  const [userRow, profileRow, settingsRow] = await Promise.all([
    db.users.findUnique({ where: { id: userId }, select: { email: true } }),
    db.profiles.findUnique({ where: { id: userId }, select: { username: true } }),
    db.profile_settings.findUnique({ where: { user_id: userId }, select: { recovery_keys: true } }),
  ]);

  const recoveryKeys = Array.isArray(settingsRow?.recovery_keys)
    ? settingsRow.recovery_keys.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    username: profileRow?.username?.trim() || EMPTY_SETTINGS_SNAPSHOT.username,
    email: userRow?.email?.trim() || EMPTY_SETTINGS_SNAPSHOT.email,
    recoveryKeys,
  };
}

export async function getSettingsSnapshotSourceVersion(userId: string): Promise<string> {
  const [userRow, profileRow, settingsRow] = await Promise.all([
    db.users.findUnique({ where: { id: userId }, select: { email: true, updated_at: true } }),
    db.profiles.findUnique({ where: { id: userId }, select: { username: true } }),
    db.profile_settings.findUnique({ where: { user_id: userId }, select: { updated_at: true, recovery_keys: true } }),
  ]);

  return JSON.stringify({
    email: userRow?.email ?? null,
    userUpdatedAt: userRow?.updated_at?.toISOString() ?? null,
    username: profileRow?.username ?? null,
    settingsUpdatedAt: settingsRow?.updated_at?.toISOString() ?? null,
    recoveryKeys: settingsRow?.recovery_keys ?? [],
  });
}
