import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { sendWelcomeConfirmationEmail } from "@/lib/email";
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
import { isUsernameValid, normalizeUsername } from "@/lib/username";

const MAX_ID_UPLOAD_BYTES = 10 * 1024 * 1024;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountAccess = "invite" | "verified" | "viewOnly";

type RegisterRequestBody = {
  name?: unknown;
  fullName?: unknown;
  displayName?: unknown;
  username?: unknown;
  email?: unknown;
  password?: unknown;
  dateOfBirth?: unknown;
  country?: unknown;
  membershipType?: unknown;
  accountAccess?: unknown;
  inviteCode?: unknown;
  discordUsername?: unknown;
  idType?: unknown;
  motivation?: unknown;
  isAdultConfirmed?: unknown;
  isConsentConfirmed?: unknown;
  isPolicyConfirmed?: unknown;
  isPhotoRuleConfirmed?: unknown;
  isSensitiveIdDetailsHidden?: unknown;
  idDocument?: File | null;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return normalizeString(value) === "true";
}

function getUploadedIdDocument(value: unknown) {
  if (!(value instanceof File) || !value.size) {
    return null;
  }

  return value;
}

function getAccountAccess(value: unknown): AccountAccess {
  const accountAccess = normalizeString(value);

  if (accountAccess === "invite" || accountAccess === "verified") {
    return accountAccess;
  }

  return "viewOnly";
}

function getAppUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

async function parseRegisterBody(req: Request): Promise<RegisterRequestBody> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as unknown;
    return isRecord(body) ? body : {};
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await req.formData();
    return {
      name: formData.get("name"),
      fullName: formData.get("fullName"),
      displayName: formData.get("displayName"),
      username: formData.get("username"),
      email: formData.get("email"),
      password: formData.get("password"),
      dateOfBirth: formData.get("dateOfBirth"),
      country: formData.get("country"),
      membershipType: formData.get("membershipType"),
      accountAccess: formData.get("accountAccess"),
      inviteCode: formData.get("inviteCode"),
      discordUsername: formData.get("discordUsername"),
      idType: formData.get("idType"),
      motivation: formData.get("motivation"),
      isAdultConfirmed: formData.get("isAdultConfirmed"),
      isConsentConfirmed: formData.get("isConsentConfirmed"),
      isPolicyConfirmed: formData.get("isPolicyConfirmed"),
      isPhotoRuleConfirmed: formData.get("isPhotoRuleConfirmed"),
      isSensitiveIdDetailsHidden: formData.get("isSensitiveIdDetailsHidden"),
      idDocument: getUploadedIdDocument(formData.get("idDocument")),
    };
  }

  return {};
}

function validateRegistrationInput(body: RegisterRequestBody) {
  const fullName = normalizeString(body.fullName);
  const displayName =
    normalizeString(body.displayName) || normalizeString(body.name);
  const submittedName = displayName || fullName;
  const usernameInput = normalizeString(body.username);
  const email = normalizeString(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const accountAccess = getAccountAccess(body.accountAccess);
  const dateOfBirth = normalizeString(body.dateOfBirth);
  const country = normalizeString(body.country);
  const membershipType = normalizeString(body.membershipType);
  const inviteCode = normalizeString(body.inviteCode);
  const discordUsername = normalizeString(body.discordUsername);
  const idType = normalizeString(body.idType);
  const motivation = normalizeString(body.motivation);
  const idDocument = body.idDocument ?? null;

  if (!submittedName || !email || !password) {
    return {
      error: "Name, email, and password are required.",
      status: 400,
    } as const;
  }

  if (submittedName.length > 100 || fullName.length > 100) {
    return {
      error: "Name must be 100 characters or fewer.",
      status: 400,
    } as const;
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      error: "Enter a valid email address.",
      status: 400,
    } as const;
  }

  if (password.length < 12) {
    return {
      error: "Password must be at least 12 characters long.",
      status: 400,
    } as const;
  }

  const normalizedUsername = normalizeUsername(
    usernameInput || submittedName || email.split("@")[0] || "naturist",
  );

  if (!normalizedUsername || !isUsernameValid(normalizedUsername)) {
    return {
      error:
        "Username must use 3-24 lowercase letters, numbers, underscores, or hyphens.",
      status: 400,
    } as const;
  }

  if (accountAccess === "invite" && (!inviteCode || !discordUsername)) {
    return {
      error: "Invite code and Discord username are required.",
      status: 400,
    } as const;
  }

  if (
    accountAccess === "verified" &&
    (!fullName || !dateOfBirth || !country || !membershipType || !idType)
  ) {
    return {
      error: "Please fill in every identity and verification field.",
      status: 400,
    } as const;
  }

  if (accountAccess === "verified" && motivation.length < 30) {
    return {
      error: "Please describe your naturist intent in at least 30 characters.",
      status: 400,
    } as const;
  }

  const confirmationsAccepted =
    normalizeBoolean(body.isAdultConfirmed) &&
    normalizeBoolean(body.isConsentConfirmed) &&
    normalizeBoolean(body.isPolicyConfirmed) &&
    normalizeBoolean(body.isPhotoRuleConfirmed);

  if (accountAccess !== "viewOnly" && !confirmationsAccepted) {
    return {
      error:
        "Confirm age, consent-first behavior, photo rules, and policy agreement.",
      status: 400,
    } as const;
  }

  if (
    accountAccess === "verified" &&
    (!normalizeBoolean(body.isSensitiveIdDetailsHidden) || !idDocument)
  ) {
    return {
      error:
        "Upload a redacted ID document and confirm only the required details remain visible.",
      status: 400,
    } as const;
  }

  return {
    accountAccess,
    country,
    dateOfBirth,
    discordUsername,
    displayName: submittedName,
    email,
    fullName,
    idDocument,
    idType,
    inviteCode,
    isSensitiveIdDetailsHidden: normalizeBoolean(
      body.isSensitiveIdDetailsHidden,
    ),
    membershipType,
    motivation,
    password,
    username: normalizedUsername,
  } as const;
}

async function generateUniqueUsername(
  supabaseAdmin: SupabaseAdminClient,
  normalizedUsername: string,
) {
  const { data: baseMatch, error: baseError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", normalizedUsername)
    .limit(1);

  if (baseError) throw new Error(baseError.message);
  if (!baseMatch?.length) return normalizedUsername;

  const base =
    normalizedUsername.slice(0, 20).replace(/[-_]+$/g, "") || "naturist";

  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 24);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .limit(1);

    if (error) throw new Error(error.message);
    if (!data?.length) return candidate;
  }

  return `${base.slice(0, 19)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isDuplicateAccountError(message: string) {
  return /already registered|already exists|duplicate|user already/i.test(
    message,
  );
}

function buildReviewerNotes(
  motivation: string,
  idDocumentPath: string,
  isSensitiveIdDetailsHidden: boolean,
) {
  return `intent=${motivation};id_document_path=${idDocumentPath};redacted_details_confirmed=${isSensitiveIdDetailsHidden}`;
}

async function uploadVerificationDocument(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  idDocument: File,
) {
  const validatedIdDocument = await validateFileUpload(idDocument, {
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

  const idDocumentPath = `${userId}/registration-id-${Date.now()}-${randomUUID()}.${validatedIdDocument.extension}`;
  const { error } = await supabaseAdmin.storage
    .from("verification-documents")
    .upload(idDocumentPath, validatedIdDocument.buffer, {
      contentType: validatedIdDocument.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Could not store ID document: ${error.message}. Ensure the Supabase storage bucket 'verification-documents' exists and allows service-role uploads.`,
    );
  }

  return idDocumentPath;
}

function buildUserMetadata(args: {
  accountAccess: AccountAccess;
  country: string;
  dateOfBirth: string;
  discordUsername: string;
  displayName: string;
  fullName: string;
  inviteCode: string;
  membershipType: string;
  username: string;
  verificationStatus: string;
}) {
  return {
    account_access: args.accountAccess,
    country: args.country,
    date_of_birth: args.dateOfBirth,
    discord_username: args.discordUsername,
    display_name: args.displayName,
    full_name: args.fullName || args.displayName,
    invite_code: args.inviteCode,
    membership_type: args.membershipType,
    onboarding_level:
      args.accountAccess === "viewOnly"
        ? "view_only_unverified"
        : "registration_submitted",
    username: args.username,
    verification_status: args.verificationStatus,
  };
}

async function deletePartialSignup(
  supabaseAdmin: SupabaseAdminClient,
  userId: string | null,
) {
  if (!userId) return;

  await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) => {
    console.error("Failed to roll back auth user after registration error", {
      userId,
      cleanupError,
    });
  });
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  let body: RegisterRequestBody;

  try {
    body = await parseRegisterBody(req);
  } catch (error) {
    console.error("Failed to parse registration request", error);
    return NextResponse.json(
      { error: "Could not parse registration request body." },
      { status: 400 },
    );
  }

  const validation = validateRegistrationInput(body);

  if ("error" in validation) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  let userId: string | null = null;
  let idDocumentPath: string | null = null;

  try {
    const username = await generateUniqueUsername(
      supabaseAdmin,
      validation.username,
    );
    const verificationStatus =
      validation.accountAccess === "verified"
        ? "pending"
        : validation.accountAccess === "invite"
          ? "trusted_partner_invite"
          : "unverified";
    const userRole =
      validation.accountAccess === "viewOnly" ? "view_only" : "newcomer";
    const metadata = buildUserMetadata({
      ...validation,
      username,
      verificationStatus,
    });
    const { data: signUpData, error: signUpError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: validation.email,
        password: validation.password,
        options: {
          data: metadata,
          redirectTo: `${getAppUrl(req)}/verified`,
        },
      });

    if (signUpError || !signUpData?.user || !signUpData.properties?.action_link) {
      const message = signUpError?.message ?? "Could not create auth user.";
      return NextResponse.json(
        {
          error: isDuplicateAccountError(message)
            ? "An account with this email already exists."
            : message,
        },
        { status: isDuplicateAccountError(message) ? 409 : 400 },
      );
    }

    userId = signUpData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        username,
        display_name: validation.displayName,
      });

    if (profileError) throw new Error(profileError.message);

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .upsert(
        {
          user_id: userId,
          user_role: userRole,
          onboarding_completed: validation.accountAccess === "invite",
          recovery_keys: [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (settingsError) throw new Error(settingsError.message);

    if (validation.accountAccess === "verified" && validation.idDocument) {
      idDocumentPath = await uploadVerificationDocument(
        supabaseAdmin,
        userId,
        validation.idDocument,
      );

      const { error: verificationError } = await supabaseAdmin
        .from("verification_submissions")
        .upsert({
          user_id: userId,
          legal_name: validation.fullName || validation.displayName,
          display_name: validation.displayName,
          date_of_birth: validation.dateOfBirth,
          country: validation.country,
          membership_type: validation.membershipType,
          id_type: validation.idType,
          is_adult_confirmed: true,
          consent_code_accepted: true,
          terms_accepted: true,
          status: "pending",
          reviewer_notes: buildReviewerNotes(
            validation.motivation,
            idDocumentPath,
            validation.isSensitiveIdDetailsHidden,
          ),
          updated_at: new Date().toISOString(),
        });

      if (verificationError) throw new Error(verificationError.message);
    }

    console.log("Sending welcome confirmation email...");

    await sendWelcomeConfirmationEmail({
      email: validation.email,
      displayName: validation.displayName,
      confirmationUrl: signUpData.properties.action_link,
    });

    console.log("Welcome confirmation email sent successfully");

    return NextResponse.json(
      {
        message:
          validation.accountAccess === "verified"
            ? "Account created. Check your email to confirm your address while your verification application is reviewed."
            : "Account created. Check your email to confirm your address before signing in.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (idDocumentPath) {
      await supabaseAdmin.storage
        .from("verification-documents")
        .remove([idDocumentPath])
        .catch((cleanupError) => {
          console.error(
            "Failed to remove verification upload after registration error",
            {
              idDocumentPath,
              cleanupError,
            },
          );
        });
    }

    await deletePartialSignup(supabaseAdmin, userId);

    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Registration failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not complete registration. Please try again.",
      },
      { status: 500 },
    );
  }
}
