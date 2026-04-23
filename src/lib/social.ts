import { supabase } from "@/lib/supabase";

export type FriendStatus = "online" | "away" | "offline";

export type Friend = {
  id: string;
  username: string;
  status: FriendStatus;
};

export type FriendRequest = {
  id: string;
  username: string;
  senderId: string;
  mutualFriends: number;
};

export type PrivacySettings = {
  showEmail: boolean;
  showActivity: boolean;
  allowFriendRequests: boolean;
};

export type ProfileSocialSettings = {
  profilePrimary: string;
  profileSecondary: string;
  privacy: PrivacySettings;
};

const defaultSettings: ProfileSocialSettings = {
  profilePrimary: "#345f45",
  profileSecondary: "#1f3326",
  privacy: {
    showEmail: false,
    showActivity: true,
    allowFriendRequests: true,
  },
};

export async function loadProfileSocialSettings(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("profile_primary_color, profile_secondary_color, show_email, show_activity, allow_friend_requests")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return defaultSettings;
  }

  return {
    profilePrimary: data.profile_primary_color ?? defaultSettings.profilePrimary,
    profileSecondary: data.profile_secondary_color ?? defaultSettings.profileSecondary,
    privacy: {
      showEmail: data.show_email ?? defaultSettings.privacy.showEmail,
      showActivity: data.show_activity ?? defaultSettings.privacy.showActivity,
      allowFriendRequests: data.allow_friend_requests ?? defaultSettings.privacy.allowFriendRequests,
    },
  } as ProfileSocialSettings;
}

export async function saveProfileSocialSettings(userId: string, settings: ProfileSocialSettings) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      profile_primary_color: settings.profilePrimary,
      profile_secondary_color: settings.profileSecondary,
      show_email: settings.privacy.showEmail,
      show_activity: settings.privacy.showActivity,
      allow_friend_requests: settings.privacy.allowFriendRequests,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("Failed to save social settings to Supabase", error.message);
  }
}

export async function loadFriends(userId: string) {
  const { data, error } = await supabase
    .from("friendships")
    .select("id, user_id, friend_user_id, friend_username, status")
    .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [] as Friend[];
  }

  return data.map((row) => ({
    id: row.user_id === userId ? row.friend_user_id : row.user_id,
    username: row.friend_username,
    status: (row.status as FriendStatus) || "offline",
  }));
}

export async function loadFriendRequests(userId: string) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, sender_id, sender_username, mutual_friends")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [] as FriendRequest[];
  }

  return data.map((row) => ({
    id: row.id,
    username: row.sender_username,
    senderId: row.sender_id,
    mutualFriends: row.mutual_friends ?? 0,
  }));
}

export async function acceptFriendRequest(userId: string, request: FriendRequest) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    console.warn("Failed to load auth session for accepting friend request", sessionError?.message ?? "Missing session");
    return false;
  }

  const response = await fetch(`/api/friend-requests/${request.id}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const message = await response.text();
    console.warn("Failed to accept friend request", message);
    return false;
  }

  return true;
}

export async function declineFriendRequest(userId: string, requestId: string) {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("receiver_id", userId);

  if (error) {
    console.warn("Failed to decline friend request", error.message);
    return false;
  }

  return true;
}
