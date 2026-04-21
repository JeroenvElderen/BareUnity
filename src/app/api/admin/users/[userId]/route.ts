import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function ensureAdmin(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: NextResponse.json({ error: "Supabase public auth config missing." }, { status: 500 }) };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return { error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }) };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) return { error: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }) };
  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const { userId } = await context.params;
  if (!userId) return NextResponse.json({ error: "Missing user id." }, { status: 400 });

  const supabaseAdmin = createSupabaseAdminClient();

  const [
    authUserResult,
    profileResult,
    settingsResult,
    verificationResult,
    postsResult,
    commentsResult,
    reportsResult,
    friendRequestsSentResult,
    friendRequestsReceivedResult,
  ] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("profile_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("verification_submissions").select("*").eq("user_id", userId).maybeSingle(),
    supabaseAdmin
      .from("posts")
      .select("id, title, content, created_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("comments")
      .select("id, post_id, content, created_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("reports")
      .select("id, reason, created_at, target_type, target_id")
      .eq("reporter_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin.from("friend_requests").select("id", { count: "exact", head: true }).eq("sender_id", userId),
    supabaseAdmin.from("friend_requests").select("id", { count: "exact", head: true }).eq("receiver_id", userId),
  ]);

  if (authUserResult.error || !authUserResult.data.user) {
    return NextResponse.json({ error: authUserResult.error?.message ?? "Could not fetch auth user." }, { status: 404 });
  }

  if (profileResult.error || settingsResult.error || verificationResult.error) {
    return NextResponse.json(
      {
        error:
          profileResult.error?.message ?? settingsResult.error?.message ?? verificationResult.error?.message ?? "Could not fetch user profile data.",
      },
      { status: 500 },
    );
  }

  if (postsResult.error || commentsResult.error || reportsResult.error) {
    return NextResponse.json(
      {
        error: postsResult.error?.message ?? commentsResult.error?.message ?? reportsResult.error?.message ?? "Could not fetch user activity.",
      },
      { status: 500 },
    );
  }

  if (friendRequestsSentResult.error || friendRequestsReceivedResult.error) {
    return NextResponse.json(
      {
        error:
          friendRequestsSentResult.error?.message ??
          friendRequestsReceivedResult.error?.message ??
          "Could not fetch user friend request counts.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: authUserResult.data.user,
    profile: profileResult.data ?? null,
    settings: settingsResult.data ?? null,
    verification: verificationResult.data ?? null,
    posts: postsResult.data ?? [],
    comments: commentsResult.data ?? [],
    reports: reportsResult.data ?? [],
    metrics: {
      friendRequestsSent: friendRequestsSentResult.count ?? 0,
      friendRequestsReceived: friendRequestsReceivedResult.count ?? 0,
      posts: postsResult.data?.length ?? 0,
      comments: commentsResult.data?.length ?? 0,
      reports: reportsResult.data?.length ?? 0,
    },
  });
}