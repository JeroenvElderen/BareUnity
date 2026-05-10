import { NextRequest, NextResponse } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";
import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .select("id, category, message, status, page_url, user_agent, user_email, user_id, created_at")
    .not("message", "like", `${LOCATION_REQUEST_PREFIX}%`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data ?? [] });
}