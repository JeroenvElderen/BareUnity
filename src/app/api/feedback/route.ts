import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { ensureAuthenticatedRequest } from "@/lib/request-auth";

const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "question", "other"]).default("other"),
  message: z.string().trim().min(10, "Please share at least 10 characters.").max(1200, "Feedback is limited to 1200 characters."),
  pageUrl: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = feedbackSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid feedback." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .insert({
      user_id: authResult.user.id,
      user_email: authResult.user.email ?? null,
      category: parsed.data.category,
      message: parsed.data.message,
      page_url: parsed.data.pageUrl || null,
      user_agent: parsed.data.userAgent || null,
      status: "new",
    })
    .select("id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback: data }, { status: 201 });
}