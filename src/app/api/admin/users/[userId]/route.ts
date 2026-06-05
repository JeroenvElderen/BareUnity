import { NextRequest, NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/request-auth";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { deleteAccountCompletely } from "@/lib/account-deletion";

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdminRequest(request);
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


  return NextResponse.json({
    user: authUserResult.data.user,
    profile: profileResult.data ?? null,
    settings: settingsResult.data ?? null,
    verification: verificationResult.data ?? null,
    posts: postsResult.data ?? [],
    comments: commentsResult.data ?? [],
    reports: reportsResult.data ?? [],
    metrics: {
      posts: postsResult.data?.length ?? 0,
      comments: commentsResult.data?.length ?? 0,
      reports: reportsResult.data?.length ?? 0,
    },
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const { userId } = await context.params;
  if (!userId) return NextResponse.json({ error: "Missing user id." }, { status: 400 });

  try {
    const result = await deleteAccountCompletely(userId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete user from admin", error);
    return NextResponse.json({ error: "Could not delete this user right now." }, { status: 503 });
  }
}
