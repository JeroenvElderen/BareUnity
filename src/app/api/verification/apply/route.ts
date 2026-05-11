import { type NextRequest, NextResponse } from "next/server";

import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const MAX_ID_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type ProfileSettings = {
  user_role: string | null;
  onboarding_completed: boolean | null;
};

type VerificationSubmission = {
  status: string | null;
};

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

function buildReviewerNotes(motivation: string, idDocumentPath: string) {
  return `intent=${motivation};id_document_path=${idDocumentPath}`;
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

  const { settingsResult, submissionResult } = await getVerificationContext(
    authResult.user.id,
  );

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
  const isVisitor =
    settings?.user_role === "view_only" && settings.onboarding_completed !== true;

  return NextResponse.json({
    ok: true,
    eligible: isVisitor && submission?.status !== "pending",
    status: submission?.status ?? (isVisitor ? "visitor" : "not_eligible"),
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
  const isVisitor =
    settings?.user_role === "view_only" && settings.onboarding_completed !== true;

  if (!isVisitor) {
    return NextResponse.json(
      { error: "Only registered Visitor Pass accounts can apply here." },
      { status: 403 },
    );
  }

  if (submissionResult.data?.status === "pending") {
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

  if (idDocument.size > MAX_ID_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "ID document must be 10MB or smaller." },
      { status: 400 },
    );
  }

  if (!ALLOWED_UPLOAD_TYPES.has(idDocument.type)) {
    return NextResponse.json(
      { error: "ID document must be a JPG, PNG, WEBP, or PDF file." },
      { status: 400 },
    );
  }

  if (motivation.length < 30) {
    return NextResponse.json(
      { error: "Please describe your naturist intent in at least 30 characters." },
      { status: 400 },
    );
  }

  const confirmationsAccepted =
    getBooleanValue(formData, "isAdultConfirmed") &&
    getBooleanValue(formData, "isConsentConfirmed") &&
    getBooleanValue(formData, "isPolicyConfirmed") &&
    getBooleanValue(formData, "isPhotoRuleConfirmed");

  if (!confirmationsAccepted) {
    return NextResponse.json(
      {
        error:
          "Confirm age, consent-first behavior, photo rules, and policy agreement before applying.",
      },
      { status: 400 },
    );
  }

  const safeFileName = idDocument.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const idDocumentPath = `${authResult.user.id}/upgrade-id-${Date.now()}-${safeFileName}`;
  const idBuffer = Buffer.from(await idDocument.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from("verification-documents")
    .upload(idDocumentPath, idBuffer, {
      contentType: idDocument.type,
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
      reviewer_notes: buildReviewerNotes(motivation, idDocumentPath),
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
  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(
    authResult.user.id,
    {
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
    },
  );

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