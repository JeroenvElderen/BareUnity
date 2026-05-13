import { type NextRequest, NextResponse } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";

type FeedbackLocationRequest = {
  id: string;
  message: string;
  status: string | null;
  page_url: string | null;
  user_email: string | null;
  user_id: string | null;
  created_at: string;
};

function parseRequest(item: FeedbackLocationRequest) {
  if (!item.message.startsWith(LOCATION_REQUEST_PREFIX)) return null;

  try {
    const payload = JSON.parse(
      item.message.slice(LOCATION_REQUEST_PREFIX.length),
    ) as {
      placeName?: string;
      locationHint?: string;
      latitude?: number;
      longitude?: number;
      website?: string;
      requestType?: "location" | "stay" | "activity";
      isStay?: boolean;
      notes?: string;
      requesterEmail?: string | null;
      requestedAt?: string;
    };

    return {
      id: item.id,
      status: item.status ?? "new",
      pageUrl: item.page_url,
      userEmail: item.user_email ?? payload.requesterEmail ?? null,
      userId: item.user_id,
      createdAt: item.created_at,
      placeName: payload.placeName ?? "",
      locationHint: payload.locationHint ?? "",
      latitude: typeof payload.latitude === "number" ? payload.latitude : null,
      longitude:
        typeof payload.longitude === "number" ? payload.longitude : null,
      website: payload.website ?? "",
      requestType:
        payload.requestType ?? (payload.isStay ? "stay" : "location"),
      isStay: Boolean(payload.isStay) || payload.requestType === "stay",
      notes: payload.notes ?? "",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .select("id, message, status, page_url, user_email, user_id, created_at")
    .eq("category", "idea")
    .like("message", `${LOCATION_REQUEST_PREFIX}%`)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data ?? []).map(parseRequest).filter(Boolean),
  });
}
