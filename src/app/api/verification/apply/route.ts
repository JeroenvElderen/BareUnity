import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import {
  UploadValidationError,
  validateFileUpload,
  VERIFICATION_DOCUMENT_EXTENSION_BY_TYPE,
  VERIFICATION_DOCUMENT_TYPES,
} from "@/lib/upload-security";

const MAX_ID_UPLOAD_BYTES = 10 * 1024 * 1024;

type ProfileSettings = {
  user_role: string | null;
  onboarding_completed: boolean | null;
};

type VerificationSubmission = {
  status: string | null;
};

function normalizeVerificationStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() ?? "";
}

function isApprovedVerificationStatus(status: string | null | undefined) {
  return normalizeVerificationStatus(status) === "approved";
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBooleanValue(formData: FormData, key: string) {
  return getStringValue(formData, key) === "true";
}

function getUploadedIdDocument(formData: FormData) {
  const value = formData.get("idDocument");

  if (!(value instanceof File) || !value.size) {
    return null;
  }

  return value;
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function buildReviewerNotes(
  motivation: string,
  idDocumentPath: string,
  isSensitiveIdDetailsHidden: boolean,
) {
  return `intent=${motivation};id_document_path=${idDocumentPath};redacted_details_confirmed=${isSensitiveIdDetailsHidden}`;
}

async function syncApprovedVerificationAccess(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  userMetadata: Record<string, unknown>,
) {
  const metadata = {
    ...userMetadata,
    account_access: "verified",
    onboarding_level: "registration_submitted",
    verification_status: "approved",
  };

  const [settingsResult, metadataResult] = await Promise.all([
    supabaseAdmin.from("profile_settings").upsert(
      {
        user_id: userId,
        user_role: "newcomer",
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    ),
    supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: metadata,
    }),
  ]);

  if (settingsResult.error) {
    return settingsResult.error.message;
  }

  if (metadataResult.error) {
    return metadataResult.error.message;
  }

  return null;
}

async function getVerificationContext(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();

  const [settingsResult, submissionResult] = await Promise.all([
    supabaseAdmin
      .from("profile_settings")
      .select("user_role,onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle<ProfileSettings>(),
    supabaseAdmin
      .from("verification_submissions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle<VerificationSubmission>(),
  ]);

  return { supabaseAdmin, settingsResult, submissionResult };
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

  const { supabaseAdmin, settingsResult, submissionResult } =
    await getVerificationContext(authResult.user.id);

  if (settingsResult.error) {
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 },
    );
  }

  if (submissionResult.error) {
    return NextResponse.json(
      { error: submissionResult.error.message },
      { status: 500 },
    );
  }

  const settings = settingsResult.data;
  const submission = submissionResult.data;
  const metadata = authResult.user.user_metadata ?? {};
  const isAdmin = isPlatformAdminEmail(authResult.user.email);
  const isApproved = isApprovedVerificationStatus(submission?.status);

  if (!isAdmin && isApproved) {
    const syncError = await syncApprovedVerificationAccess(
      supabaseAdmin,
      authResult.user.id,
      metadata,
    );

    if (syncError) {
      return NextResponse.json({ error: syncError }, { status: 500 });
    }
  }
  const isVisitor =
    !isAdmin &&
    settings?.user_role === "view_only" &&
    settings.onboarding_completed !== true;

  return NextResponse.json({
    ok: true,
    eligible:
      isVisitor &&
      !["pending", "approved"].includes(
        normalizeVerificationStatus(submission?.status),
      ),
    status: isAdmin
      ? "admin"
      : (submission?.status ?? (isVisitor ? "visitor" : "not_eligible")),
    defaults: {
      legalName: getMetadataString(metadata, "full_name"),
      displayName: getMetadataString(metadata, "display_name"),
      dateOfBirth: getMetadataString(metadata, "date_of_birth"),
      country: getMetadataString(metadata, "country"),
      membershipType: getMetadataString(metadata, "membership_type"),
    },
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

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Verification application requires multipart form data." },
      { status: 400 },
    );
  }

  const { supabaseAdmin, settingsResult, submissionResult } =
    await getVerificationContext(authResult.user.id);

  if (settingsResult.error) {
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 },
    );
  }

  if (submissionResult.error) {
    return NextResponse.json(
      { error: submissionResult.error.message },
      { status: 500 },
    );
  }

  const settings = settingsResult.data;
  const isAdmin = isPlatformAdminEmail(authResult.user.email);
  const isVisitor =
    !isAdmin &&
    settings?.user_role === "view_only" &&
    settings.onboarding_completed !== true;

  if (!isVisitor) {
    return NextResponse.json(
      { error: "Only registered Visitor Pass accounts can apply here." },
      { status: 403 },
    );
  }

  if (isApprovedVerificationStatus(submissionResult.data?.status)) {
    return NextResponse.json(
      { error: "Your verification application is already approved." },
      { status: 409 },
    );
  }

  if (
    normalizeVerificationStatus(submissionResult.data?.status) === "pending"
  ) {
    return NextResponse.json(
      { error: "Your verification application is already pending review." },
      { status: 409 },
    );
  }

  const formData = await request.formData();
  const legalName = getStringValue(formData, "legalName");
  const displayName = getStringValue(formData, "displayName");
  const dateOfBirth = getStringValue(formData, "dateOfBirth");
  const country = getStringValue(formData, "country");
  const membershipType = getStringValue(formData, "membershipType");
  const idType = getStringValue(formData, "idType");
  const motivation = getStringValue(formData, "motivation");
  const idDocument = getUploadedIdDocument(formData);

  if (
    !legalName ||
    !displayName ||
    !dateOfBirth ||
    !country ||
    !membershipType ||
    !idType
  ) {
    return NextResponse.json(
      { error: "Please fill in every identity and verification field." },
      { status: 400 },
    );
  }

  if (!idDocument) {
    return NextResponse.json(
      { error: "Please upload a government ID document for review." },
      { status: 400 },
    );
  }

  let validatedIdDocument;

  try {
    validatedIdDocument = await validateFileUpload(idDocument, {
      allowedTypes: VERIFICATION_DOCUMENT_TYPES,
      extensionByType: VERIFICATION_DOCUMENT_EXTENSION_BY_TYPE,
      maxBytes: MAX_ID_UPLOAD_BYTES,
      emptyMessage:
        "Please upload a non-empty government ID document for review.",
      typeMessage: "ID document must be a JPG, PNG, WEBP, or PDF file.",
      sizeMessage: "ID document must be 10MB or smaller.",
      signatureMessage:
        "ID document contents do not match the declared file type.",
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  if (motivation.length < 30) {
    return NextResponse.json(
      {
        error:
          "Please describe your naturist intent in at least 30 characters.",
      },
      { status: 400 },
    );
  }

  const isSensitiveIdDetailsHidden = getBooleanValue(
    formData,
    "isSensitiveIdDetailsHidden",
  );

  const confirmationsAccepted =
    getBooleanValue(formData, "isAdultConfirmed") &&
    getBooleanValue(formData, "isConsentConfirmed") &&
    getBooleanValue(formData, "isPolicyConfirmed") &&
    getBooleanValue(formData, "isPhotoRuleConfirmed") &&
    isSensitiveIdDetailsHidden;

  if (!confirmationsAccepted) {
    return NextResponse.json(
      {
        error:
          "Confirm age, consent-first behavior, photo rules, policy agreement, and that only your legal name, date of birth, and official ID seal/logo/header remain visible.",
      },
      { status: 400 },
    );
  }

  const idDocumentPath = `${authResult.user.id}/upgrade-id-${Date.now()}-${randomUUID()}.${validatedIdDocument.extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("verification-documents")
    .upload(idDocumentPath, validatedIdDocument.buffer, {
      contentType: validatedIdDocument.contentType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error:
          `Could not store ID document: ${uploadError.message}. ` +
          "Ensure the Supabase storage bucket 'verification-documents' exists and allows service-role uploads.",
      },
      { status: 500 },
    );
  }

  const { error: verificationError } = await supabaseAdmin
    .from("verification_submissions")
    .upsert({
      user_id: authResult.user.id,
      legal_name: legalName,
      display_name: displayName,
      date_of_birth: dateOfBirth,
      country,
      membership_type: membershipType,
      id_type: idType,
      is_adult_confirmed: true,
      consent_code_accepted: true,
      terms_accepted: true,
      status: "pending",
      reviewer_notes: buildReviewerNotes(
        motivation,
        idDocumentPath,
        isSensitiveIdDetailsHidden,
      ),
      updated_at: new Date().toISOString(),
    });

  if (verificationError) {
    await supabaseAdmin.storage
      .from("verification-documents")
      .remove([idDocumentPath]);

    return NextResponse.json(
      { error: verificationError.message },
      { status: 500 },
    );
  }

  const { error: settingsError } = await supabaseAdmin
    .from("profile_settings")
    .update({
      user_role: "newcomer",
      onboarding_completed: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", authResult.user.id);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const userMetadata = authResult.user.user_metadata ?? {};
  const { error: metadataError } =
    await supabaseAdmin.auth.admin.updateUserById(authResult.user.id, {
      user_metadata: {
        ...userMetadata,
        full_name: legalName,
        display_name: displayName,
        country,
        membership_type: membershipType,
        date_of_birth: dateOfBirth,
        account_access: "verified",
        onboarding_level: "L2_safety_training_complete",
        verification_status: "pending",
        motivation,
      },
    });

  if (metadataError) {
    return NextResponse.json({ error: metadataError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: "pending",
    message:
      "Verification application submitted. You can keep browsing as a visitor while the team reviews your ID.",
  });
}
