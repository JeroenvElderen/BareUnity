import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LOCATION_REQUEST_PREFIX } from "@/lib/location-requests";
import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "question", "other"]).default("other"),
  message: z
    .string()
    .trim()
    .min(10, "Please share at least 10 characters.")
    .max(1200, "Feedback is limited to 1200 characters."),
  pageUrl: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(500).optional(),
});

type FeedbackReply = {
  id: string;
  feedback_id: string;
  author_id: string | null;
  author_email: string | null;
  author_role: "member" | "admin";
  message: string;
  created_at: string;
};

type FeedbackTicket = {
  id: string;
  category: "bug" | "idea" | "question" | "other";
  message: string;
  status: string | null;
  page_url: string | null;
  user_agent: string | null;
  user_email: string | null;
  user_id: string | null;
  created_at: string;
  feedback_replies?: FeedbackReply[];
};

function withSortedReplies(ticket: FeedbackTicket) {
  return {
    ...ticket,
    replies: [...(ticket.feedback_replies ?? [])].sort(
      (first, second) =>
        new Date(first.created_at).getTime() -
        new Date(second.created_at).getTime(),
    ),
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("feedback_messages")
    .select(
      "id, category, message, status, page_url, user_agent, user_email, user_id, created_at, feedback_replies(id, feedback_id, author_id, author_email, author_role, message, created_at)",
    )
    .eq("user_id", authResult.user.id)
    .not("message", "like", `${LOCATION_REQUEST_PREFIX}%`)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    feedback: ((data ?? []) as FeedbackTicket[]).map(withSortedReplies),
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = feedbackSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feedback." },
      { status: 400 },
    );
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
    .select(
      "id, category, message, status, page_url, user_agent, user_email, user_id, created_at",
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { feedback: { ...data, replies: [] } },
    { status: 201 },
  );
}
