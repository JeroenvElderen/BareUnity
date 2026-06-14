import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const updateRequestSchema = z.object({
  countrySlug: z.string().trim().min(2).max(120),
  countryName: z.string().trim().min(2).max(120),
  changeType: z.enum([
    "laws",
    "beach",
    "resort",
    "safety",
    "season",
    "general",
  ]),
  message: z
    .string()
    .trim()
    .min(10, "Please describe what needs changing in at least 10 characters.")
    .max(5000, "Update requests are limited to 5000 characters."),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
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

  const parsed = updateRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update request." },
      { status: 400 },
    );
  }

  const requestBody = parsed.data;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("country_update_requests")
    .insert({
      user_id: authResult.user.id,
      user_email: authResult.user.email ?? null,
      country_slug: requestBody.countrySlug,
      country_name: requestBody.countryName,
      change_type: requestBody.changeType,
      message: requestBody.message,
      source_url: requestBody.sourceUrl || null,
      page_url: requestBody.pageUrl || null,
      status: "new",
    })
    .select("id,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data }, { status: 201 });
}
