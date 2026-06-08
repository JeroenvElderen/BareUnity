import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("id")
    .eq("username", "JeroentheNaturist")
    .single();

  if (!profile) {
    return NextResponse.json({
      success: false,
      error: "Profile not found",
    });
  }

  await createNotification({
    userId: profile.id,
    type: "admin-feedback",
    title: "Test Notification",
    detail: "Your notification system is working.",
    targetHref: "/notifications",
  });

  return NextResponse.json({
    success: true,
  });
}