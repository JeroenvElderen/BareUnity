import { NextResponse } from "next/server";

import { db } from "@/server/db";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("token")?.trim();

  if (!token) {
    return jsonError("Verification token is required.", 400);
  }

  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!verificationToken) {
    return jsonError("Verification token is invalid.", 404);
  }

  if (!verificationToken.user) {
    await db.verificationToken.delete({
      where: { id: verificationToken.id },
    });

    return jsonError("Verification token user was not found.", 404);
  }

  if (verificationToken.expiresAt.getTime() < Date.now()) {
    await db.verificationToken.delete({
      where: { id: verificationToken.id },
    });

    return jsonError("Verification token has expired.", 410);
  }

  await db.$transaction([
    db.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true },
    }),
    db.verificationToken.delete({
      where: { id: verificationToken.id },
    }),
  ]);

  return NextResponse.redirect(new URL("/verified", requestUrl));
}
