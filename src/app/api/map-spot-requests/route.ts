import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureMemberCanAct } from "@/lib/action-access";
import {
  DISCORD_LOCATION_REQUESTS_FORUM_ID,
  enqueueDiscordLocationRequestEvent,
} from "@/lib/discord-crosspost-sync";

const coordinate = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}, z.number().finite().optional());

const requestTypeSchema = z.enum(["location", "stay", "activity"]);

const locationRequestSchema = z.object({
  placeName: z
    .string()
    .trim()
    .min(2, "Please add a place name.")
    .max(160, "Place name is too long."),
  locationHint: z
    .string()
    .trim()
    .min(2, "Please add a location hint.")
    .max(500, "Location hint is too long."),
  latitude: coordinate,
  longitude: coordinate,
  website: z.string().trim().max(500, "Website is too long.").optional(),
  requestType: requestTypeSchema.default("location"),
  isStay: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes are limited to 1000 characters.")
    .optional(),
  pageUrl: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const actionAccessError = await ensureMemberCanAct(authResult.user.id);
  if (actionAccessError) return actionAccessError;

  const parsed = locationRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid location request." },
      { status: 400 },
    );
  }

  const hasLatitude = typeof parsed.data.latitude === "number";
  const hasLongitude = typeof parsed.data.longitude === "number";

  if ((parsed.data.requestType === "stay" || parsed.data.isStay) && !parsed.data.website?.trim()) {
    return NextResponse.json(
      { error: "Add the official website for stay requests. Stays are only hotels, resorts, or camping." },
      { status: 400 },
    );
  }
  
  if (hasLatitude !== hasLongitude) {
    return NextResponse.json(
      { error: "Add both latitude and longitude, or leave both blank." },
      { status: 400 },
    );
  }

  if (
    (hasLatitude &&
      ((parsed.data.latitude as number) < -90 ||
        (parsed.data.latitude as number) > 90)) ||
    (hasLongitude &&
      ((parsed.data.longitude as number) < -180 ||
        (parsed.data.longitude as number) > 180))
  ) {
    return NextResponse.json(
      { error: "Coordinates are outside the valid latitude/longitude range." },
      { status: 400 },
    );
  }

  const requestPayload = {
    ...parsed.data,
    isStay: parsed.data.requestType === "stay" || parsed.data.isStay,
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

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await enqueueDiscordLocationRequestEvent({
      requestId: data.id,
      requesterUserId: authResult.user.id,
      requesterEmail: authResult.user.email ?? null,
      placeName: requestPayload.placeName,
      locationHint: requestPayload.locationHint,
      latitude: requestPayload.latitude ?? null,
      longitude: requestPayload.longitude ?? null,
      website: requestPayload.website?.trim() || null,
      requestType: requestPayload.requestType,
      isStay: requestPayload.isStay,
      notes: requestPayload.notes?.trim() || null,
      pageUrl: requestPayload.pageUrl?.trim() || null,
      requestedAt: requestPayload.requestedAt,
      createdAt: data.created_at ?? null,
      locationRequestsForumId: DISCORD_LOCATION_REQUESTS_FORUM_ID,
    });
  } catch (eventError) {
    console.error("Failed to queue Discord location request event", {
      requestId: data.id,
      eventError,
    });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
