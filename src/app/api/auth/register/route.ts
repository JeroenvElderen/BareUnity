import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { normalizeUsername } from "@/lib/username";

type RegisterBody = {
  fullName?: string;
  displayName?: string;
  email?: string;
  password?: string;
  dateOfBirth?: string;
  country?: string;
  membershipType?: string;
  idType?: string;
  motivation?: string;
  consentCode?: string;
  quizAnswerRespect?: string;
  quizAnswerConsent?: string;
  quizAnswerReporting?: string;
  isAdultConfirmed?: boolean;
  isConsentConfirmed?: boolean;
  isPolicyConfirmed?: boolean;
  isPhotoRuleConfirmed?: boolean;
};

const CONSENT_CODE = "NATURISM-FIRST";
const MINIMUM_AGE = 18;
const MAX_ID_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function buildUsername(fullName: string, displayName: string) {
  const base = normalizeUsername(displayName || fullName || "naturist") || "naturist";
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

  if (monthDifference < 0 || (monthDifference === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
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
      { error: "Server auth config is incomplete. Missing Supabase admin credentials." },
      { status: 500 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Registration requires multipart form data with an uploaded ID document." },
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
  const idType = getStringValue(formData, "idType").trim();
  const motivation = getStringValue(formData, "motivation").trim();
  const consentCode = getStringValue(formData, "consentCode").trim().toUpperCase();
  const idDocument = getUploadedIdDocument(formData);

  if (!fullName || !displayName || !email || !password || !dateOfBirth || !country || !membershipType || !idType || !motivation) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  if (!idDocument) {
    return NextResponse.json(
      { error: "Upload an ID file (JPG, PNG, WEBP, or PDF) for manual review." },
      { status: 400 },
    );
  }

  if (idDocument.size > MAX_ID_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "ID upload exceeds 10MB. Please upload a smaller file." },
      { status: 400 },
    );
  }

  if (!ALLOWED_UPLOAD_TYPES.has(idDocument.type)) {
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

  if (motivation.length < 30) {
    return NextResponse.json(
      { error: "Please describe your naturist intent in at least 30 characters." },
      { status: 400 },
    );
  }

  const isAdultConfirmed = parseBooleanValue(getStringValue(formData, "isAdultConfirmed"));
  const isConsentConfirmed = parseBooleanValue(getStringValue(formData, "isConsentConfirmed"));
  const isPolicyConfirmed = parseBooleanValue(getStringValue(formData, "isPolicyConfirmed"));
  const isPhotoRuleConfirmed = parseBooleanValue(getStringValue(formData, "isPhotoRuleConfirmed"));

  if (!isAdultConfirmed || !isConsentConfirmed || !isPolicyConfirmed || !isPhotoRuleConfirmed) {
    return NextResponse.json(
      { error: "You must confirm age, consent-first behavior, photo rules, and policy agreement." },
      { status: 400 },
    );
  }

  if (consentCode !== CONSENT_CODE) {
    return NextResponse.json(
      { error: `Consent code must exactly match ${CONSENT_CODE}.` },
      { status: 400 },
    );
  }

  const passedQuiz =
    getStringValue(formData, "quizAnswerRespect") === "correct" &&
    getStringValue(formData, "quizAnswerConsent") === "correct" &&
    getStringValue(formData, "quizAnswerReporting") === "correct";

  if (!passedQuiz) {
    return NextResponse.json(
      {
        error:
          "Safety quiz was not passed. Review the rules and choose the consent-first answers for all questions.",
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

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: fullName,
      display_name: displayName,
      country,
      membership_type: membershipType,
      date_of_birth: dateOfBirth,
      onboarding_level: "L2_safety_training_complete",
      motivation,
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
  const safeFileName = idDocument.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const idDocumentPath = `${userId}/id-${Date.now()}-${safeFileName}`;

  const idBuffer = Buffer.from(await idDocument.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from("verification-documents")
    .upload(idDocumentPath, idBuffer, {
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

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    username,
    display_name: displayName,
  });

  const { error: settingsError } = await supabaseAdmin.from("profile_settings").upsert({
    user_id: userId,
    onboarding_completed: false,
  });

  const { error: verificationError } = await supabaseAdmin.from("verification_submissions").upsert({
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
    reviewer_notes: `intent=${motivation};id_document_path=${idDocumentPath}`,
  });

  if (profileError || settingsError || verificationError) {
    await supabaseAdmin.storage.from("verification-documents").remove([idDocumentPath]);
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
    message:
      "Account created with strict safety onboarding. Your profile remains in verification review before full access.",
  });
}