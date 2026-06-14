import { NextResponse } from "next/server";

import { sendPasswordResetEmail } from "@/lib/email";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PasswordResetRequestBody = {
  email?: unknown;
};

function getAppUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  let body: PasswordResetRequestBody;

  try {
    body = (await req.json()) as PasswordResetRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Could not parse password reset request body." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
  redirectTo: `${getAppUrl(req)}/reset-password`,
},
  });

  if (error || !data?.properties?.action_link) {
    console.error("Failed to generate password reset link", error);
    return NextResponse.json({ ok: true });
  }

  await sendPasswordResetEmail({
    email,
    resetUrl: data.properties.action_link,
  }).catch((emailError) => {
    console.error("Failed to send password reset email", emailError);
  });

  return NextResponse.json({ ok: true });
}
