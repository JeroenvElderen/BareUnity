import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

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

type VerificationDecision = "approved" | "rejected";

async function sendVerificationDecisionEmail(to: string, decision: VerificationDecision) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return {
      sent: false,
      reason: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL environment variables.",
    } as const;
  }

  const subject =
    decision === "approved"
      ? "BareUnity application approved"
      : "BareUnity application update";
  const text =
    decision === "approved"
      ? "Your BareUnity application has been approved. You can now sign in to your account."
      : "Your BareUnity application has been rejected. Your account has been removed.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      sent: false,
      reason: `Resend API error (${response.status}): ${errorBody}`,
    } as const;
  }

  return { sent: true } as const;
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
  const { data: userData, error: userLookupError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (userLookupError) {
    return NextResponse.json({ error: userLookupError.message }, { status: 500 });
  }

  const userEmail = userData.user?.email?.trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json({ error: "User email was not found for this account." }, { status: 404 });
  }

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

  if (body.decision === "approved") {
    const { error: updateVerificationError } = await supabaseAdmin
      .from("verification_submissions")
      .update({
        status: "approved",
        reviewer_notes: mergedReviewerNotes || existing.reviewer_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateVerificationError) {
      return NextResponse.json({ error: updateVerificationError.message }, { status: 500 });
    }

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .update({ onboarding_completed: true })
      .eq("user_id", userId);

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    const { error: confirmEmailError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (confirmEmailError) {
      return NextResponse.json({ error: confirmEmailError.message }, { status: 500 });
    }

    const emailResult = await sendVerificationDecisionEmail(userEmail, "approved");
    if (!emailResult.sent) {
      console.error("Failed to send approval email", emailResult.reason);
    }
  } else {
    const { error: updateVerificationError } = await supabaseAdmin
      .from("verification_submissions")
      .update({
        status: "rejected",
        reviewer_notes: mergedReviewerNotes || existing.reviewer_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateVerificationError) {
      return NextResponse.json({ error: updateVerificationError.message }, { status: 500 });
    }

    const idDocumentPath = extractIdDocumentPath(existing.reviewer_notes);
    if (idDocumentPath) {
      await supabaseAdmin.storage.from("verification-documents").remove([idDocumentPath]);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
    }

    const emailResult = await sendVerificationDecisionEmail(userEmail, "rejected");
    if (!emailResult.sent) {
      console.error("Failed to send rejection email", emailResult.reason);
    }
  }

  return NextResponse.json({ ok: true });
}