import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function extractIdDocumentPath(reviewerNotes: string | null) {
  if (!reviewerNotes) return null;

  const marker = "id_document_path=";
  const start = reviewerNotes.indexOf(marker);

  if (start < 0) {
    return null;
  }

  const value = reviewerNotes.slice(start + marker.length);
  const terminator = value.indexOf(";");
  return (terminator >= 0 ? value.slice(0, terminator) : value).trim() || null;
}

function buildReviewerNotes(existingNotes: string | null, reviewerNote: string) {
  const idDocumentPath = extractIdDocumentPath(existingNotes);
  const intent = existingNotes?.match(/intent=([^;]+)/)?.[1]?.trim();
  const notes: string[] = [];

  if (intent) {
    notes.push(`intent=${intent}`);
  }

  if (idDocumentPath) {
    notes.push(`id_document_path=${idDocumentPath}`);
  }

  if (reviewerNote.trim()) {
    notes.push(`review=${reviewerNote.trim()}`);
  }

  return notes.join(";");
}

async function ensureAdmin(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      error: NextResponse.json({ error: "Supabase public auth config missing." }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return {
      error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }),
    };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return {
      error: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }),
    };
  }

  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdmin(request);

  if ("error" in adminResult) {
    return adminResult.error;
  }

  const { userId } = await params;
  const body = (await request.json()) as {
    decision?: "approved" | "rejected";
    reviewerNote?: string;
  };

  if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
    return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("verification_submissions")
    .select("reviewer_notes")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const mergedReviewerNotes = buildReviewerNotes(existing.reviewer_notes, body.reviewerNote ?? "");

  const { error: updateVerificationError } = await supabaseAdmin
    .from("verification_submissions")
    .update({
      status: body.decision,
      reviewer_notes: mergedReviewerNotes || existing.reviewer_notes,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateVerificationError) {
    return NextResponse.json({ error: updateVerificationError.message }, { status: 500 });
  }

  const { error: settingsError } = await supabaseAdmin
    .from("profile_settings")
    .update({ onboarding_completed: body.decision === "approved" })
    .eq("user_id", userId);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}