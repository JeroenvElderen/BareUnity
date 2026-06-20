import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "../auth";
import { importStayWebsite } from "./importer";

function statusForImportError(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Missing website URL." || error.message === "Enter a valid http(s) website URL.") return 400;
  if (error.message === "No crawlable website pages or documents were found.") return 502;
  return 500;
}

function hasValidDiscordSecret(request: NextRequest) {
  const expectedSecret = process.env.BAREUNITY_DISCORD_SECRET || process.env.DISCORD_CROSSPOST_SECRET;
  const providedSecret = request.headers.get("x-bareunity-discord-secret") ?? "";
  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}

export async function GET(request: NextRequest) {
  if (!hasValidDiscordSecret(request)) {
    const adminResult = await ensureStayAdmin(request);
    if ("error" in adminResult) return adminResult.error;
  }

  const url = new URL(request.url).searchParams.get("url")?.trim() ?? "";

  try {
    const draft = await importStayWebsite(url);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this website." },
      { status: statusForImportError(error) },
    );
  }
}
