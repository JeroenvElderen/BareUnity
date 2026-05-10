import { NextRequest, NextResponse } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

type RawReport = {
  id: string;
  reason: string | null;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  target_type: string | null;
  target_id: string | null;
  profiles: { id: string; username: string | null; display_name: string | null } | null;
  posts: { id: string; title: string | null; content: string | null; media_url: string | null; post_type: string | null; author_id: string | null } | null;
  comments: { id: string; content: string | null; author_id: string | null } | null;
};

type ProfileRow = { id: string; username: string | null; display_name: string | null };

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select(`
      id,
      reason,
      created_at,
      post_id,
      comment_id,
      target_type,
      target_id,
      profiles:profiles!reports_reporter_id_fkey (id, username, display_name),
      posts:posts (id, title, content, media_url, post_type, author_id),
      comments:comments (id, content, author_id)
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const reports = (data ?? []) as unknown as RawReport[];
  const targetUserIds = Array.from(
    new Set(
      reports
        .flatMap((report) => [
          report.target_type === "user" ? report.target_id : null,
          report.posts?.author_id ?? null,
          report.comments?.author_id ?? null,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const profilesById = new Map<string, ProfileRow>();
  if (targetUserIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", targetUserIds);

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    ((profileRows ?? []) as ProfileRow[]).forEach((profile) => profilesById.set(profile.id, profile));
  }

  return NextResponse.json({
    reports: reports.map((report) => ({
      ...report,
      target_profile:
        (report.target_type === "user" && report.target_id ? profilesById.get(report.target_id) : null) ?? null,
      post_author_profile: report.posts?.author_id ? profilesById.get(report.posts.author_id) ?? null : null,
      comment_author_profile: report.comments?.author_id ? profilesById.get(report.comments.author_id) ?? null : null,
    })),
  });
}