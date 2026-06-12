import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const statusSchema = z.object({
  status: z.enum(["new", "reviewing", "done", "dismissed"]),
});

type RouteContext = {
  params: Promise<{ feedbackId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const { feedbackId } = await context.params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid status." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .update({ status: parsed.data.status })
    .eq("id", feedbackId)
    .select("id, status")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data });
}
