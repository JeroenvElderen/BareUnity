import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  findBareUnityProfileByDiscordUserId,
  normalizeDiscordId,
  normalizeOptionalString,
  requireIntegrationRequest,
} from "../helpers";

export async function POST(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const discordUserId = normalizeDiscordId(body.discordUserId);
  const registeredByDiscordUserId = normalizeDiscordId(body.registeredByDiscordUserId);
  if (!discordUserId || !registeredByDiscordUserId) {
    return NextResponse.json({ error: "Discord member and moderator IDs are required." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const linkedProfile = await findBareUnityProfileByDiscordUserId(supabaseAdmin, discordUserId);

  const registration = {
    discord_user_id: discordUserId,
    discord_username: normalizeOptionalString(body.discordUsername),
    discord_display_name: normalizeOptionalString(body.discordDisplayName),
    bareunity_user_id: linkedProfile?.id ?? null,
    registered_by_discord_user_id: registeredByDiscordUserId,
    registered_by_discord_username: normalizeOptionalString(body.registeredByDiscordUsername),
    enabled: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("discord_crosspost_registrations").upsert(registration, {
    onConflict: "discord_user_id",
  });

  if (error) {
    console.error("Discord crosspost registration failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    linked: Boolean(linkedProfile),
    bareunityUserId: linkedProfile?.id ?? null,
    bareunityUsername: linkedProfile?.username ?? null,
  });
}