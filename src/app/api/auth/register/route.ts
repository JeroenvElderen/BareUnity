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
  isAdultConfirmed?: boolean;
  isConsentConfirmed?: boolean;
  isPolicyConfirmed?: boolean;
};

function buildUsername(fullName: string, displayName: string) {
  const base = normalizeUsername(displayName || fullName || "naturist") || "naturist";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${suffix}`;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Server auth config is incomplete. Missing Supabase admin credentials." },
      { status: 500 },
    );
  }

  const body = (await req.json()) as RegisterBody;
  const fullName = body.fullName?.trim() ?? "";
  const displayName = body.displayName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const dateOfBirth = body.dateOfBirth ?? "";
  const country = body.country?.trim() ?? "";
  const membershipType = body.membershipType?.trim() ?? "";
  const idType = body.idType?.trim() ?? "";

  if (!fullName || !displayName || !email || !password || !dateOfBirth || !country || !membershipType || !idType) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  if (!body.isAdultConfirmed || !body.isConsentConfirmed || !body.isPolicyConfirmed) {
    return NextResponse.json(
      { error: "You must confirm age, consent-first behavior, and policy agreement." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
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
    display_name,
    date_of_birth: dateOfBirth,
    country,
    membership_type: membershipType,
    id_type: idType,
    is_adult_confirmed: true,  
    consent_code_accepted: true,
    terms_accepted: true,
    status: "pending",
  });

  if (profileError || settingsError || verificationError) {
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
      "Account created. Email confirmation requirements depend on your Supabase auth settings.",
  });
}