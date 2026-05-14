import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { normalizeUsername } from "@/lib/username";
import { buildVisitorTrialMetadata } from "@/lib/visitor-trial";

type RegisterBody = {
  fullName?: string;
  displayName?: string;
  email?: string;
  password?: string;
  dateOfBirth?: string;
  country?: string;
  membershipType?: string;
  accountAccess?: string;
  idType?: string;
  motivation?: string;
  isAdultConfirmed?: boolean;
  isConsentConfirmed?: boolean;
  isPolicyConfirmed?: boolean;
  isPhotoRuleConfirmed?: boolean;
  isSensitiveIdDetailsHidden?: boolean;
};

const MINIMUM_AGE = 18;
const MAX_ID_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCOUNT_ACCESS_VALUES = new Set(["verified", "viewOnly"]);
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const UPLOAD_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const SIGNATURE_VALIDATORS: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) =>
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/png": (buffer) =>
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (buffer) =>
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (buffer) =>
    buffer.subarray(0, 5).toString("ascii") === "%PDF-",
};

function createDocumentFingerprint(buffer: Buffer) {
  const pepper = process.env.VERIFICATION_DOCUMENT_HASH_PEPPER;

  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error(
      "VERIFICATION_DOCUMENT_HASH_PEPPER must be set in production.",
    );
  }

  if (pepper) {
    const digest = createHmac("sha256", pepper).update(buffer).digest("hex");
    return `hmac-sha256:${digest}`;
  }

  const digest = createHash("sha256").update(buffer).digest("hex");
  return `sha256:${digest}`;
}

function hasValidFileSignature(contentType: string, buffer: Buffer) {
  const validator = SIGNATURE_VALIDATORS[contentType];
  return Boolean(validator?.(buffer));
}

function buildUsername(fullName: string, displayName: string) {
  const base =
    normalizeUsername(displayName || fullName || "naturist") || "naturist";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${suffix}`;
}

function isAtLeastMinimumAge(dateOfBirth: string, minimumAge: number) {
  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return false;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= minimumAge;
}

function hasStrongPassword(password: string) {
  if (password.length < 12) {
    return false;
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^\w\s]/.test(password);

  return hasUppercase && hasLowercase && hasNumber && hasSymbol;
}

function parseBooleanValue(value: string | undefined) {
  return value === "true";
}

function getStringValue(formData: FormData, key: keyof RegisterBody) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getUploadedIdDocument(formData: FormData) {
  const value = formData.get("idDocument");

  if (!(value instanceof File)) {
    return null;
  }

  if (!value.size) {
    return null;
  }

  return value;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      {
        error:
          "Server auth config is incomplete. Missing Supabase admin credentials.",
      },
      { status: 500 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Registration requires multipart form data." },
      { status: 400 },
    );
  }

  let formData: FormData;

  try {
    formData = await req.formData();
  } catch (error) {
    console.error("Failed to parse register form data", error);
    return NextResponse.json(
      {
        error:
          "Unable to process the uploaded form data. Ensure the full request is under 10MB and try again.",
      },
      { status: 400 },
    );
  }

  const fullName = getStringValue(formData, "fullName").trim();
  const displayName = getStringValue(formData, "displayName").trim();
  const email = getStringValue(formData, "email").trim().toLowerCase();
  const password = getStringValue(formData, "password");
  const dateOfBirth = getStringValue(formData, "dateOfBirth");
  const country = getStringValue(formData, "country").trim();
  const membershipType = getStringValue(formData, "membershipType").trim();
  const requestedAccountAccess = getStringValue(
    formData,
    "accountAccess",
  ).trim();
  const accountAccess = ACCOUNT_ACCESS_VALUES.has(requestedAccountAccess)
    ? requestedAccountAccess
    : "viewOnly";
  const isVerifiedApplication = accountAccess === "verified";
  const idType = getStringValue(formData, "idType").trim();
  const motivation = getStringValue(formData, "motivation").trim();
  const idDocument = getUploadedIdDocument(formData);
  const isSensitiveIdDetailsHidden = parseBooleanValue(
    getStringValue(formData, "isSensitiveIdDetailsHidden"),
  );

  if (
    !fullName ||
    !displayName ||
    !email ||
    !password ||
    !dateOfBirth ||
    !country ||
    !membershipType
  ) {
    return NextResponse.json(
      { error: "Please fill in all required fields." },
      { status: 400 },
    );
  }

  if (isVerifiedApplication && (!idType || !motivation)) {
    return NextResponse.json(
      { error: "Verified registration requires ID type and joining reason." },
      { status: 400 },
    );
  }

  if (isVerifiedApplication && !idDocument) {
    return NextResponse.json(
      {
        error: "Upload an ID file (JPG, PNG, WEBP, or PDF) for manual review.",
      },
      { status: 400 },
    );
  }

  if (isVerifiedApplication && !isSensitiveIdDetailsHidden) {
    return NextResponse.json(
      {
        error:
          "Confirm only your legal name, date of birth, and the official ID seal/logo/header remain visible.",
      },
      { status: 400 },
    );
  }

  if (idDocument && idDocument.size > MAX_ID_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "ID upload exceeds 10MB. Please upload a smaller file." },
      { status: 400 },
    );
  }

  if (idDocument && !ALLOWED_UPLOAD_TYPES.has(idDocument.type)) {
    return NextResponse.json(
      { error: "Invalid ID file type. Allowed formats: JPG, PNG, WEBP, PDF." },
      { status: 400 },
    );
  }

  if (!isAtLeastMinimumAge(dateOfBirth, MINIMUM_AGE)) {
    return NextResponse.json(
      { error: "You must be at least 18 years old to create an account." },
      { status: 400 },
    );
  }

  if (isVerifiedApplication && motivation.length < 30) {
    return NextResponse.json(
      {
        error:
          "Please describe your naturist intent in at least 30 characters.",
      },
      { status: 400 },
    );
  }

  const isAdultConfirmed = parseBooleanValue(
    getStringValue(formData, "isAdultConfirmed"),
  );
  const isConsentConfirmed = parseBooleanValue(
    getStringValue(formData, "isConsentConfirmed"),
  );
  const isPolicyConfirmed = parseBooleanValue(
    getStringValue(formData, "isPolicyConfirmed"),
  );
  const isPhotoRuleConfirmed = parseBooleanValue(
    getStringValue(formData, "isPhotoRuleConfirmed"),
  );

  if (
    !isAdultConfirmed ||
    !isConsentConfirmed ||
    !isPolicyConfirmed ||
    !isPhotoRuleConfirmed
  ) {
    return NextResponse.json(
      {
        error:
          "You must confirm age, consent-first behavior, photo rules, and policy agreement.",
      },
      { status: 400 },
    );
  }

  if (!hasStrongPassword(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  let idDocumentBuffer: Buffer | null = null;
  let idDocumentFingerprint: string | null = null;

  if (isVerifiedApplication && idDocument) {
    idDocumentBuffer = Buffer.from(await idDocument.arrayBuffer());

    if (!hasValidFileSignature(idDocument.type, idDocumentBuffer)) {
      return NextResponse.json(
        { error: "ID file contents do not match the declared file type." },
        { status: 400 },
      );
    }

    try {
      idDocumentFingerprint = createDocumentFingerprint(idDocumentBuffer);
    } catch (error) {
      console.error("Verification document fingerprint config error", error);
      return NextResponse.json(
        {
          error: "Server verification document security config is incomplete.",
        },
        { status: 500 },
      );
    }
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const visitorTrialMetadata = isVerifiedApplication
    ? {}
    : buildVisitorTrialMetadata();

  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        display_name: displayName,
        country,
        membership_type: membershipType,
        date_of_birth: dateOfBirth,
        onboarding_level: isVerifiedApplication
          ? "verification_pending"
          : "view_only_unverified",
        account_access: accountAccess,
        verification_status: isVerifiedApplication ? "pending" : "unverified",
        motivation: isVerifiedApplication ? motivation : "",
        ...visitorTrialMetadata,
      },
    });

  if (createUserError || !createdUser.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? "Could not create user." },
      { status: 400 },
    );
  }

  const userId = createdUser.user.id;
  const username = buildUsername(fullName, displayName);
  let idDocumentPath: string | null = null;

  if (isVerifiedApplication && idDocument && idDocumentBuffer) {
    const extension = UPLOAD_EXTENSION_BY_TYPE[idDocument.type] ?? "bin";
    idDocumentPath = `${userId}/id-${Date.now()}-${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("verification-documents")
      .upload(idDocumentPath, idDocumentBuffer, {
        contentType: idDocument.type,
        upsert: false,
      });

    if (uploadError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);

      return NextResponse.json(
        {
          error:
            `Could not store ID document: ${uploadError.message}. ` +
            "Ensure the Supabase storage bucket 'verification-documents' exists and allows service-role uploads.",
        },
        { status: 500 },
      );
    }
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    username,
    display_name: displayName,
  });

  const { error: settingsError } = await supabaseAdmin
    .from("profile_settings")
    .upsert({
      user_id: userId,
      user_role: isVerifiedApplication ? "newcomer" : "view_only",
      onboarding_completed: false,
    });

  const { error: verificationError } = isVerifiedApplication
    ? await supabaseAdmin.from("verification_submissions").upsert({
        user_id: userId,
        legal_name: fullName,
        display_name: displayName,
        date_of_birth: dateOfBirth,
        country,
        membership_type: membershipType,
        id_type: idType,
        is_adult_confirmed: true,
        consent_code_accepted: true,
        terms_accepted: true,
        status: "pending",
        reviewer_notes: JSON.stringify({
          intent: motivation,
          idDocumentPath,
          idDocumentFingerprint,
          redactedDetailsConfirmed: isSensitiveIdDetailsHidden,
        }),
      })
    : { error: null };

  if (profileError || settingsError || verificationError) {
    if (idDocumentPath) {
      await supabaseAdmin.storage
        .from("verification-documents")
        .remove([idDocumentPath]);
    }
    await supabaseAdmin.auth.admin.deleteUser(userId);

    return NextResponse.json(
      {
        error:
          profileError?.message ??
          settingsError?.message ??
          verificationError?.message ??
          "Account setup failed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: isVerifiedApplication
      ? "Account created with strict safety onboarding. Your profile remains in verification review before full access."
      : "Your 7-day Visitor Pass is ready. You can browse and preview BareUnity now; posting, messaging, friend requests, check-ins, and submissions unlock after ID verification.",
  });
}
