import { NextRequest, NextResponse } from "next/server";
import { sendVerificationDecisionEmail } from "@/lib/email";
import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

function parseReviewerNotesJson(reviewerNotes: string | null) {
  if (!reviewerNotes?.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(reviewerNotes) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getReviewerNotesValue(
  reviewerNotes: string | null,
  marker: string,
  jsonKey?: string,
) {
  const parsed = parseReviewerNotesJson(reviewerNotes);
  const parsedValue = jsonKey ? parsed?.[jsonKey] : null;

  if (typeof parsedValue === "string" && parsedValue.trim()) {
    return parsedValue.trim();
  }

  if (!reviewerNotes) return null;

  const start = reviewerNotes.indexOf(marker);

  if (start < 0) {
    return null;
  }

  const value = reviewerNotes.slice(start + marker.length);
  const terminator = value.indexOf(";");
  return (terminator >= 0 ? value.slice(0, terminator) : value).trim() || null;
}

function extractIdDocumentPath(reviewerNotes: string | null) {
  return getReviewerNotesValue(
    reviewerNotes,
    "id_document_path=",
    "idDocumentPath",
  );
}

function buildReviewerNotes(
  existingNotes: string | null,
  reviewerNote: string,
  options: {
    keepIdDocumentPath?: boolean;
    markIdDocumentDeleted?: boolean;
  } = {},
) {
  const idDocumentPath = extractIdDocumentPath(existingNotes);
  const intent = getReviewerNotesValue(existingNotes, "intent=", "intent");
  const notes: string[] = [];

  if (intent) {
    notes.push(`intent=${intent}`);
  }

  if (idDocumentPath && options.keepIdDocumentPath !== false) {
    notes.push(`id_document_path=${idDocumentPath}`);
  }

  if (options.markIdDocumentDeleted) {
    notes.push(`id_document_deleted_at=${new Date().toISOString()}`);
  }

  if (reviewerNote.trim()) {
    notes.push(`review=${reviewerNote.trim()}`);
  }

  return notes.join(";");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const adminResult = await ensureAdminRequest(request);

  if ("error" in adminResult) {
    return adminResult.error;
  }

  const { userId } = await params;
  const body = (await request.json()) as {
    decision?: "approved" | "rejected";
    reviewerNote?: string;
  };

  if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
    return NextResponse.json(
      { error: "Decision must be approved or rejected." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: userData, error: userLookupError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (userLookupError) {
    return NextResponse.json(
      { error: userLookupError.message },
      { status: 500 },
    );
  }

  const userEmail = userData.user?.email?.trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { error: "User email was not found for this account." },
      { status: 404 },
    );
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
    return NextResponse.json(
      { error: "Application not found." },
      { status: 404 },
    );
  }

  if (body.decision === "approved") {
    const idDocumentPath = extractIdDocumentPath(existing.reviewer_notes);

    if (idDocumentPath) {
      const { error: removeError } = await supabaseAdmin.storage
        .from("verification-documents")
        .remove([idDocumentPath]);

      if (removeError) {
        return NextResponse.json(
          { error: removeError.message },
          { status: 500 },
        );
      }
    }

    const mergedReviewerNotes = buildReviewerNotes(
      existing.reviewer_notes,
      body.reviewerNote ?? "",
      {
        keepIdDocumentPath: false,
        markIdDocumentDeleted: Boolean(idDocumentPath),
      },
    );

    const { error: updateVerificationError } = await supabaseAdmin
      .from("verification_submissions")
      .update({
        status: "approved",
        reviewer_notes: mergedReviewerNotes || existing.reviewer_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateVerificationError) {
      return NextResponse.json(
        { error: updateVerificationError.message },
        { status: 500 },
      );
    }

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .update({ user_role: "newcomer", onboarding_completed: true })
      .eq("user_id", userId);

    if (settingsError) {
      return NextResponse.json(
        { error: settingsError.message },
        { status: 500 },
      );
    }

    const { error: confirmEmailError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

    if (confirmEmailError) {
      return NextResponse.json(
        { error: confirmEmailError.message },
        { status: 500 },
      );
    }

    await sendVerificationDecisionEmail({
      email: userEmail,
      decision: "approved",
    }).catch((error) => {
      console.error("Failed to send approval email", error);
    });
  } else {
    const idDocumentPath = extractIdDocumentPath(existing.reviewer_notes);

    if (idDocumentPath) {
      const { error: removeError } = await supabaseAdmin.storage
        .from("verification-documents")
        .remove([idDocumentPath]);

      if (removeError) {
        return NextResponse.json(
          { error: removeError.message },
          { status: 500 },
        );
      }
    }

    const mergedReviewerNotes = buildReviewerNotes(
      existing.reviewer_notes,
      body.reviewerNote ?? "",
      {
        keepIdDocumentPath: false,
        markIdDocumentDeleted: Boolean(idDocumentPath),
      },
    );

    const { error: updateVerificationError } = await supabaseAdmin
      .from("verification_submissions")
      .update({
        status: "rejected",
        reviewer_notes: mergedReviewerNotes || existing.reviewer_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateVerificationError) {
      return NextResponse.json(
        { error: updateVerificationError.message },
        { status: 500 },
      );
    }

    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return NextResponse.json(
        { error: deleteUserError.message },
        { status: 500 },
      );
    }

    await sendVerificationDecisionEmail({
      email: userEmail,
      decision: "rejected",
    }).catch((error) => {
      console.error("Failed to send rejection email", error);
    });
  }

  return NextResponse.json({ ok: true });
}
