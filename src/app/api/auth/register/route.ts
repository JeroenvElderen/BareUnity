import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import {
  getUsernameValidationMessage,
  normalizeUsername,
} from "@/lib/username";
import { buildVisitorTrialMetadata } from "@/lib/visitor-trial";

type RegisterBody = {
  fullName?: string;
  displayName?: string;
  username?: string;
  email?: string;
  password?: string;
  dateOfBirth?: string;
  country?: string;
  membershipType?: string;
  accountAccess?: string;
  inviteCode?: string;
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
const ACCOUNT_ACCESS_VALUES = new Set(["verified", "viewOnly", "invite"]);
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

type InviteCodeRow = {
  code_text: string;
  status: "pending" | "used";
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

function normalizeInviteCode(code: string) {
  return code.trim();
}

function isInviteCodePending(row: InviteCodeRow | null) {
  return row?.status === "pending";
}

async function resetInviteCodeToPending(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  inviteCode: string,
) {
  const { error } = await supabaseAdmin
    .from("invite_codes")
    .update({ status: "pending" })
    .eq("code_text", inviteCode)
    .eq("status", "used");

  if (error) {
    console.error("Could not release invite code after setup failure", error);
  }
}

function getSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function getInviteCodeSetupError(error: unknown) {
  const code = getSupabaseErrorCode(error);

  if (
    ["42P01", "42883", "PGRST106", "PGRST200", "PGRST202", "PGRST205"]
      .includes(code)
  ) {
    return (
      "Invite-code table is not installed yet. " +
      "Run supabase-simple-invite-codes.sql in the Supabase SQL editor, " +
      "then insert your custom text into public.invite_codes."
    );
  }

  return null;
}

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
  const requestedUsername = normalizeUsername(
    getStringValue(formData, "username"),
  );
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
  const isInviteRegistration = accountAccess === "invite";
  const grantsVerifiedAccess = isVerifiedApplication || isInviteRegistration;
  const inviteCode = normalizeInviteCode(
    getStringValue(formData, "inviteCode"),
  );
  const idType = getStringValue(formData, "idType").trim();
  const motivation = getStringValue(formData, "motivation").trim();
  const idDocument = getUploadedIdDocument(formData);
  const isSensitiveIdDetailsHidden = parseBooleanValue(
    getStringValue(formData, "isSensitiveIdDetailsHidden"),
  );

  if (isInviteRegistration) {
    if (!fullName || !requestedUsername || !email || !password || !inviteCode) {
      return NextResponse.json(
        {
          error:
            "Please fill in name, username, email, password, and invite code.",
        },
        { status: 400 },
      );
    }

    const usernameValidationError =
      getUsernameValidationMessage(requestedUsername);

    if (usernameValidationError) {
      return NextResponse.json(
        { error: usernameValidationError },
        { status: 400 },
      );
    }
  } else if (
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

  if (isInviteRegistration && !inviteCode) {
    return NextResponse.json(
      {
        error:
          "Enter the invite code supplied by your trusted verification partner.",
      },
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

  if (!isInviteRegistration && !isAtLeastMinimumAge(dateOfBirth, MINIMUM_AGE)) {
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
    !isInviteRegistration &&
    (!isAdultConfirmed ||
      !isConsentConfirmed ||
      !isPolicyConfirmed ||
      !isPhotoRuleConfirmed)
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

  if (isInviteRegistration) {
    const { data: inviteRow, error: inviteLookupError } = await supabaseAdmin
      .from("invite_codes")
      .select("code_text,status")
      .eq("code_text", inviteCode)
      .maybeSingle<InviteCodeRow>();

    if (inviteLookupError) {
      const setupError = getInviteCodeSetupError(inviteLookupError);

      return NextResponse.json(
        {
          error:
            setupError ??
            `Could not validate invite code: ${inviteLookupError.message}`,
        },
        { status: 500 },
      );
    }

    if (!isInviteCodePending(inviteRow)) {
      return NextResponse.json(
        {
          error: "This invite code is invalid or has already been used.",
        },
        { status: 400 },
      );
    }

    const { data: existingProfile, error: usernameLookupError } =
      await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", requestedUsername)
        .maybeSingle<{ id: string }>();

    if (usernameLookupError) {
      return NextResponse.json(
        { error: `Could not check username: ${usernameLookupError.message}` },
        { status: 500 },
      );
    }

    if (existingProfile) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 400 },
      );
    }
  }

  let reservedInviteCode: InviteCodeRow | null = null;

  if (isInviteRegistration) {
    const { data: updatedInviteCode, error: reservationError } =
      await supabaseAdmin
        .from("invite_codes")
        .update({ status: "used" })
        .eq("code_text", inviteCode)
        .eq("status", "pending")
        .select("code_text,status")
        .maybeSingle<InviteCodeRow>();

    if (reservationError || !updatedInviteCode) {
      const setupError = reservationError
        ? getInviteCodeSetupError(reservationError)
        : null;

      return NextResponse.json(
        {
          error:
            setupError ??
            reservationError?.message ??
            "This invite code is invalid or has already been used.",
        },
        { status: setupError ? 500 : 400 },
      );
    }

    reservedInviteCode = updatedInviteCode;
  }

  const visitorTrialMetadata = grantsVerifiedAccess
    ? {}
    : buildVisitorTrialMetadata();

  const userMetadata = {
    full_name: fullName,
    display_name: isInviteRegistration ? fullName : displayName,
    username: isInviteRegistration ? requestedUsername : undefined,
    country: isInviteRegistration ? "Trusted partner verified" : country,
    membership_type: isInviteRegistration
      ? "Trusted partner invite"
      : membershipType,
    date_of_birth: isInviteRegistration ? undefined : dateOfBirth,
    onboarding_level: isInviteRegistration
      ? "L2_safety_training_complete"
      : isVerifiedApplication
        ? "verification_pending"
        : "view_only_unverified",
    account_access: grantsVerifiedAccess ? "verified" : "viewOnly",
    verification_status: isInviteRegistration
      ? "approved"
      : isVerifiedApplication
        ? "pending"
        : "unverified",
    verification_source: isInviteRegistration
      ? "trusted_partner_invite"
      : undefined,
    invite_code: isInviteRegistration ? inviteCode : undefined,
    motivation: isVerifiedApplication ? motivation : "",
    ...visitorTrialMetadata,
  };

  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

  if (createUserError || !createdUser.user) {
    if (reservedInviteCode) {
      await resetInviteCodeToPending(supabaseAdmin, inviteCode);
    }

    return NextResponse.json(
      { error: createUserError?.message ?? "Could not create user." },
      { status: 400 },
    );
  }

  const userId = createdUser.user.id;
  const username = isInviteRegistration
    ? requestedUsername
    : buildUsername(fullName, displayName);
  const profileDisplayName = isInviteRegistration ? fullName : displayName;
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
      if (reservedInviteCode) {
        await resetInviteCodeToPending(supabaseAdmin, inviteCode);
      }

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
    display_name: profileDisplayName,
  });

  const { error: settingsError } = await supabaseAdmin
    .from("profile_settings")
    .upsert({
      user_id: userId,
      user_role: grantsVerifiedAccess ? "newcomer" : "view_only",
      onboarding_completed: grantsVerifiedAccess,
    });

  const { error: verificationError } = grantsVerifiedAccess
    ? await supabaseAdmin.from("verification_submissions").upsert({
        user_id: userId,
        legal_name: fullName,
        display_name: profileDisplayName,
        date_of_birth: isInviteRegistration ? "1900-01-01" : dateOfBirth,
        country: isInviteRegistration ? "Trusted partner verified" : country,
        membership_type: isInviteRegistration
          ? "Trusted partner invite"
          : membershipType,
        id_type: isInviteRegistration ? "trusted_partner_invite" : idType,
        is_adult_confirmed: true,
        consent_code_accepted: true,
        terms_accepted: true,
        status: isInviteRegistration ? "approved" : "pending",
        reviewer_notes: JSON.stringify(
          isInviteRegistration
            ? {
                source: "trusted_partner_invite",
                inviteCode,
                username,
                thirdPartyAgeVerification: true,
                dateOfBirthNotCollectedByBareUnity: true,
              }
            : {
                intent: motivation,
                idDocumentPath,
                idDocumentFingerprint,
                redactedDetailsConfirmed: isSensitiveIdDetailsHidden,
              },
        ),
      })
    : { error: null };

  if (profileError || settingsError || verificationError) {
    if (idDocumentPath) {
      await supabaseAdmin.storage
        .from("verification-documents")
        .remove([idDocumentPath]);
    }
    await supabaseAdmin.auth.admin.deleteUser(userId);
    if (reservedInviteCode) {
      await resetInviteCodeToPending(supabaseAdmin, inviteCode);
    }

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
    message: isInviteRegistration
      ? "Invite accepted. Your verified account is ready. You can sign in now with your email and password."
      : isVerifiedApplication
        ? "Account created with strict safety onboarding. Your profile remains in verification review before full access."
        : "Your 7-day Visitor Pass is ready. You can browse and preview BareUnity now; posting, check-ins, and submissions unlock after ID verification.",
  });
}
