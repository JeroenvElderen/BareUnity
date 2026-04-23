import { supabase } from "@/lib/supabase";

export type SendFriendRequestResult = {
  ok: boolean;
  reason?: "self" | "not_authenticated" | "user_not_found" | "already_friends" | "already_requested" | "blocked" | "failed";
  message: string;
};

type TargetProfile = {
  id: string;
  username: string;
  allow_friend_requests: boolean | null;
};

export async function resolveTargetProfile(options: { userId?: string | null; username?: string | null }): Promise<TargetProfile | null> {
  const baseQuery = supabase.from("profiles").select("id, username, allow_friend_requests").limit(1);

  const result = options.userId
    ? await baseQuery.eq("id", options.userId).maybeSingle<TargetProfile>()
    : await baseQuery.eq("username", options.username ?? "").maybeSingle<TargetProfile>();

  if (result.error) {
    console.warn("Failed to resolve target profile", result.error.message);
    return null;
  }

  return result.data ?? null;
}

export async function sendFriendRequestToProfile(target: { id?: string | null; username?: string | null }): Promise<SendFriendRequestResult> {
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  if (!viewer) {
    return { ok: false, reason: "not_authenticated", message: "Sign in to send a friend request." };
  }

  const receiverProfile = await resolveTargetProfile({ userId: target.id, username: target.username });
  if (!receiverProfile) {
    return { ok: false, reason: "user_not_found", message: "Could not find that member profile." };
  }

  if (receiverProfile.id === viewer.id) {
    return { ok: false, reason: "self", message: "This is your profile." };
  }

  if (receiverProfile.allow_friend_requests === false) {
    return { ok: false, reason: "blocked", message: "This member is not accepting requests right now." };
  }

  const [existingFriendship, existingRequest, senderProfile] = await Promise.all([
    supabase
      .from("friendships")
      .select("id")
      .eq("user_id", viewer.id)
      .eq("friend_user_id", receiverProfile.id)
      .limit(1)
      .maybeSingle<{ id: string }>(),
    supabase
      .from("friend_requests")
      .select("id,status")
      .eq("sender_id", viewer.id)
      .eq("receiver_id", receiverProfile.id)
      .in("status", ["pending", "accepted"])
      .limit(1)
      .maybeSingle<{ id: string; status: string }>(),
    supabase.from("profiles").select("username").eq("id", viewer.id).maybeSingle<{ username: string | null }>(),
  ]);

  if (existingFriendship.data?.id) {
    return { ok: false, reason: "already_friends", message: `You're already connected with @${receiverProfile.username}.` };
  }

  if (existingRequest.data?.id) {
    return { ok: false, reason: "already_requested", message: "Friend request already sent." };
  }

  const senderUsername = senderProfile.data?.username?.trim() || "member";

  const { error } = await supabase.from("friend_requests").insert({
    sender_id: viewer.id,
    receiver_id: receiverProfile.id,
    sender_username: senderUsername,
  });

  if (error) {
    console.warn("Failed to send friend request", error.message);
    return { ok: false, reason: "failed", message: "Could not send the friend request right now." };
  }

  return { ok: true, message: `Friend request sent to @${receiverProfile.username}.` };
}
