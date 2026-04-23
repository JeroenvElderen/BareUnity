import { NextResponse } from "next/server";

import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return NextResponse.json({ error: "Missing request id" }, { status: 400 });
    }

    const accepted = await db.$transaction(async (tx) => {
      const friendRequest = await tx.friend_requests.findFirst({
        where: {
          id: requestId,
          receiver_id: viewerId,
        },
        select: {
          id: true,
          sender_id: true,
          sender_username: true,
          status: true,
        },
      });

      if (!friendRequest) {
        return { ok: false as const, reason: "not_found" as const };
      }

      if (friendRequest.status === "declined") {
        return { ok: false as const, reason: "conflict" as const };
      }

      if (friendRequest.status !== "accepted") {
        await tx.friend_requests.update({
          where: { id: friendRequest.id },
          data: { status: "accepted" },
        });
      }

      const [receiverProfile, senderProfile, forwardFriendship, reverseFriendship] = await Promise.all([
        tx.profiles.findUnique({
          where: { id: viewerId },
          select: { username: true },
        }),
        tx.profiles.findUnique({
          where: { id: friendRequest.sender_id },
          select: { username: true },
        }),
        tx.friendships.findFirst({
          where: {
            user_id: viewerId,
            friend_user_id: friendRequest.sender_id,
          },
          select: { id: true },
        }),
        tx.friendships.findFirst({
          where: {
            user_id: friendRequest.sender_id,
            friend_user_id: viewerId,
          },
          select: { id: true },
        }),
      ]);

      const receiverUsername = receiverProfile?.username?.trim() || "member";
      const senderUsername = senderProfile?.username?.trim() || friendRequest.sender_username || "member";

      if (!forwardFriendship?.id) {
        await tx.friendships.create({
          data: {
            user_id: viewerId,
            friend_user_id: friendRequest.sender_id,
            friend_username: senderUsername,
            status: "online",
          },
        });
      }

      if (!reverseFriendship?.id) {
        await tx.friendships.create({
          data: {
            user_id: friendRequest.sender_id,
            friend_user_id: viewerId,
            friend_username: receiverUsername,
            status: "online",
          },
        });
      }

      return { ok: true as const };
    });

    if (!accepted.ok) {
      if (accepted.reason === "not_found") {
        return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
      }

      return NextResponse.json({ error: "This friend request cannot be accepted." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to accept friend request", error);
    return NextResponse.json({ error: "Unable to accept friend request." }, { status: 503 });
  }
}
