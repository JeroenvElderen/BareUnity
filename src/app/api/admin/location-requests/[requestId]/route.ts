import { type NextRequest, NextResponse } from "next/server";

import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const { requestId } = await context.params;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .delete()
    .eq("id", requestId)
    .eq("category", "idea")
    .like("message", `${LOCATION_REQUEST_PREFIX}%`)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Location request was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ request: data });
}
