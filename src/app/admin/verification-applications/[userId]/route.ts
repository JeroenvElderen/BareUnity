import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
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


async function notifyVerificationDecision(
  userId: string,
  decision: "approved" | "rejected",
) {
  const approved = decision === "approved";

  await createNotification({
    userId,
    type: "verification-decision",
    title: approved ? "Application approved" : "Application reviewed",
    detail: approved
      ? "Your BareUnity application has been approved. Your account is ready to use."
      : "Your BareUnity application was reviewed and could not be approved right now. You can review your details and apply again.",
    targetHref: approved ? "/" : "/settings",
  }).catch((error) => {
    console.error("Failed to create verification decision notification", error);
  });
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

  if (!userData.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
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
      .update({
        user_role: "newcomer",
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
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
        user_metadata: {
          ...(userData.user.user_metadata ?? {}),
          account_access: "verified",
          onboarding_level: "L2_safety_training_complete",
          verification_status: "approved",
        },
      });

    if (confirmEmailError) {
      return NextResponse.json(
        { error: confirmEmailError.message },
        { status: 500 },
      );
    }

    await notifyVerificationDecision(userId, "approved");
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

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .update({
        user_role: "view_only",
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (settingsError) {
      return NextResponse.json(
        { error: settingsError.message },
        { status: 500 },
      );
    }

    const { error: metadataError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(userData.user.user_metadata ?? {}),
          account_access: "viewOnly",
          onboarding_level: "view_only_unverified",
          verification_status: "rejected",
        },
      });

    if (metadataError) {
      return NextResponse.json(
        { error: metadataError.message },
        { status: 500 },
      );
    }

    await notifyVerificationDecision(userId, "rejected");
  }

  return NextResponse.json({ ok: true });
}
