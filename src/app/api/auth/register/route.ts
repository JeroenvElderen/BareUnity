import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { sendVerificationEmail } from "@/lib/email";
import { createVerificationToken } from "@/lib/tokens";
import { db } from "@/server/db";

type RegisterRequestBody = {
  name?: unknown;
  displayName?: unknown;
  email?: unknown;
  password?: unknown;
};

const BCRYPT_SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      password: formData.get("password"),
    };
  }

  return {};
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateRegistrationInput(body: RegisterRequestBody) {
  const name = normalizeString(body.name) || normalizeString(body.displayName);
  const email = normalizeString(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return {
      error: "Name, email, and password are required.",
      status: 400,
    } as const;
  }

  if (name.length > 100) {
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

  return { name, email, password } as const;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function POST(req: Request) {
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

  const existingUser = await db.user.findUnique({
    where: { email: validation.email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const hashedPassword = await bcrypt.hash(
    validation.password,
    BCRYPT_SALT_ROUNDS,
  );

  let userId: string | null = null;

  try {
    const user = await db.user.create({
      data: {
        name: validation.name,
        email: validation.email,
        password: hashedPassword,
        emailVerified: false,
      },
      select: { id: true, email: true },
    });

    userId = user.id;

    const verificationToken = await createVerificationToken(user.id);
    await sendVerificationEmail(user.email, verificationToken.token);

    return NextResponse.json(
      {
        message:
          "Registration successful. Please check your email to verify your account.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    if (userId) {
      await db.user.delete({ where: { id: userId } }).catch((cleanupError) => {
        console.error("Failed to roll back user after registration error", {
          userId,
          cleanupError,
        });
      });
    }

    console.error("Registration failed", error);

    return NextResponse.json(
      {
        error:
          "Could not complete registration. Please check SMTP configuration and try again.",
      },
      { status: 500 },
    );
  }
}
