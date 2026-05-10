import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const coordinate = z.preprocess((value) => Number(value), z.number().finite());

const locationRequestSchema = z.object({
  placeName: z.string().trim().min(2, "Please add a place name.").max(160, "Place name is too long."),
  locationHint: z.string().trim().min(2, "Please add a location hint.").max(500, "Location hint is too long."),
  latitude: coordinate,
  longitude: coordinate,
  website: z.string().trim().max(500, "Website is too long.").optional(),
  isStay: z.boolean().default(false),
  notes: z.string().trim().max(1000, "Notes are limited to 1000 characters.").optional(),
  pageUrl: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = locationRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid location request." }, { status: 400 });
  }

  if (
    (typeof parsed.data.latitude === "number" && (parsed.data.latitude < -90 || parsed.data.latitude > 90)) ||
    (typeof parsed.data.longitude === "number" && (parsed.data.longitude < -180 || parsed.data.longitude > 180))
  ) {
    return NextResponse.json({ error: "Coordinates are outside the valid latitude/longitude range." }, { status: 400 });
  }

  const requestPayload = {
    ...parsed.data,
    requesterEmail: authResult.user.email ?? null,
    requestedAt: new Date().toISOString(),
  };

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .insert({
      user_id: authResult.user.id,
      user_email: authResult.user.email ?? null,
      category: "idea",
      message: `${LOCATION_REQUEST_PREFIX}${JSON.stringify(requestPayload)}`,
      page_url: parsed.data.pageUrl || null,
      user_agent: request.headers.get("user-agent") ?? null,
      status: "new",
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data }, { status: 201 });
}
