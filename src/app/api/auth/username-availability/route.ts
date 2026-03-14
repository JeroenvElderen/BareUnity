import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { createUsernameSuggestions, getUsernameValidationMessage, normalizeUsername } from "@/lib/username";

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("username") ?? "";
  const username = normalizeUsername(value);
  const validationError = getUsernameValidationMessage(username);

  if (!username || validationError) {
    return NextResponse.json({
      username,
      available: false,
      message: validationError,
      suggestions: createUsernameSuggestions(value).slice(0, 4),
    });
  }

  const existing = await db.profiles.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ username, available: true, message: "Username is available", suggestions: [] });
  }

  const suggestions = createUsernameSuggestions(username);

  const taken = await db.profiles.findMany({
    where: { username: { in: suggestions } },
    select: { username: true },
  });

  const takenSet = new Set(taken.map((entry) => entry.username));

  return NextResponse.json({
    username,
    available: false,
    message: "That username is already taken",
    suggestions: suggestions.filter((candidate) => !takenSet.has(candidate)).slice(0, 4),
  });
}