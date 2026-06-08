import { NextResponse } from "next/server";
import { messaging } from "@/lib/firebase-admin";
import { supabase } from "@/lib/supabase";

export async function POST() {
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_token")
    .not("push_token", "is", null)
    .limit(1)
    .single();

  if (!profile?.push_token) {
    return NextResponse.json(
      { error: "No push token found" },
      { status: 400 }
    );
  }

  const result = await messaging.send({
    token: profile.push_token,
    notification: {
      title: "BareUnity",
      body: "🎉 Push notifications are working!",
    },
  });

  return NextResponse.json({
    success: true,
    messageId: result,
  });
}