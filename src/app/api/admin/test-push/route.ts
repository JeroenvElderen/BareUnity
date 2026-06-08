import { NextResponse } from "next/server";
import { messaging } from "@/lib/firebase-admin";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data: profile, error } = await supabaseServer
    .from("profiles")
    .select("push_token, username")
    .not("push_token", "is", null)
    .limit(1)
    .single();

  if (error || !profile?.push_token) {
    return NextResponse.json(
      {
        success: false,
        error: "No push token found",
      },
      { status: 400 }
    );
  }

  const messageId = await messaging.send({
    token: profile.push_token,
    notification: {
      title: "BareUnity",
      body: "🎉 Your first push notification is working!",
    },
  });

  return NextResponse.json({
    success: true,
    messageId,
    user: profile.username,
  });
}