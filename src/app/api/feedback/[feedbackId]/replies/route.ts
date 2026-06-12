import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const replySchema = z.object({
  message: z.string().trim().min(2, "Please enter a reply.").max(1200, "Replies are limited to 1200 characters."),
});

type RouteContext = {
  params: Promise<{ feedbackId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const { feedbackId } = await context.params;
  const parsed = replySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reply." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("feedback_messages")
    .select("id, user_id")
    .eq("id", feedbackId)
    .single();

  if (ticketError) return NextResponse.json({ error: ticketError.message }, { status: 500 });
  if (!ticket || ticket.user_id !== authResult.user.id) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const { data: reply, error: replyError } = await supabaseAdmin
    .from("feedback_replies")
    .insert({
      feedback_id: feedbackId,
      author_id: authResult.user.id,
      author_email: authResult.user.email ?? null,
      author_role: "member",
      message: parsed.data.message,
    })
    .select("id, feedback_id, author_id, author_email, author_role, message, created_at")
    .single();

  if (replyError) return NextResponse.json({ error: replyError.message }, { status: 500 });

  await supabaseAdmin.from("feedback_messages").update({ status: "awaiting_admin" }).eq("id", feedbackId);

  return NextResponse.json({ reply }, { status: 201 });
}