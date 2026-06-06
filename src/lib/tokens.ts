import crypto from "node:crypto";

import { db } from "@/server/db";

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

export function createVerificationTokenValue() {
  return crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
}

export function getVerificationTokenExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);
  return expiresAt;
}

export async function createVerificationToken(userId: string) {
  const token = createVerificationTokenValue();
  const expiresAt = getVerificationTokenExpiryDate();

  await db.verificationToken.deleteMany({
    where: { userId },
  });

  return db.verificationToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}
