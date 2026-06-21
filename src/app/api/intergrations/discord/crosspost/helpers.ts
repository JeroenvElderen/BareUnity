import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

export const CROSSPOST_FALLBACK_AUTHOR_ID =
  process.env.FALLBACK_CROSSPOST_AUTHOR_ID ?? "00e59273-e45d-4528-b05a-74c4075e6035";
export const CROSSPOST_OWNER_DISCORD_USER_ID =
  process.env.CROSSPOST_OWNER_DISCORD_USER_ID ?? "946346329783803945";
export const CROSSPOST_OWNER_PROFILE_ID =
  process.env.CROSSPOST_OWNER_PROFILE_ID ?? "d0eb25c5-5a45-46c2-827c-17a00ebe8343";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export function requireIntegrationRequest(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const expectedSecret = process.env.DISCORD_CROSSPOST_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "Discord crosspost secret is not configured." }, { status: 500 });
  }

  const providedSecret = request.headers.get("x-bareunity-discord-secret")?.trim();
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized Discord integration request." }, { status: 401 });
  }

  return null;
}

export function normalizeDiscordId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{5,32}$/.test(trimmed) ? trimmed : "";
}

export function normalizeOptionalString(value: unknown, maxLength = 256) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function getDiscordUserIdFromAuthUser(user: { identities?: unknown; user_metadata?: unknown }) {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const discordIdentity = identities.find((identity) => {
    return identity && typeof identity === "object" && "provider" in identity && identity.provider === "discord";
  });

  if (
    discordIdentity &&
    typeof discordIdentity === "object" &&
    "identity_data" in discordIdentity &&
    discordIdentity.identity_data &&
    typeof discordIdentity.identity_data === "object" &&
    "sub" in discordIdentity.identity_data &&
    typeof discordIdentity.identity_data.sub === "string"
  ) {
    return discordIdentity.identity_data.sub;
  }

  if (
    user.user_metadata &&
    typeof user.user_metadata === "object" &&
    "discord_user_id" in user.user_metadata &&
    typeof user.user_metadata.discord_user_id === "string"
  ) {
    return user.user_metadata.discord_user_id;
  }

  if (
    user.user_metadata &&
    typeof user.user_metadata === "object" &&
    "provider_id" in user.user_metadata &&
    typeof user.user_metadata.provider_id === "string"
  ) {
    return user.user_metadata.provider_id;
  }

  return null;
}

export async function findBareUnityProfileByDiscordUserId(supabaseAdmin: SupabaseAdmin, discordUserId: string) {
  const { data: identityMatch, error: identityError } = await supabaseAdmin
    .from("profile_discord_identities")
    .select("profile_id, profiles:profiles(id, username, display_name)")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  if (!identityError && identityMatch?.profile_id) {
    const profile = Array.isArray(identityMatch.profiles) ? identityMatch.profiles[0] : identityMatch.profiles;
    return {
      id: String(identityMatch.profile_id),
      username: typeof profile?.username === "string" ? profile.username : null,
      displayName: typeof profile?.display_name === "string" ? profile.display_name : null,
    };
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);

    const user = data.users.find((entry) => getDiscordUserIdFromAuthUser(entry) === discordUserId);
    if (user) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, username, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);
      if (!profile) return null;

      await supabaseAdmin.from("profile_discord_identities").upsert({
        profile_id: profile.id,
        discord_user_id: discordUserId,
      });

      return {
        id: String(profile.id),
        username: typeof profile.username === "string" ? profile.username : null,
        displayName: typeof profile.display_name === "string" ? profile.display_name : null,
      };
    }

    if (data.users.length < 1000) break;
  }

  return null;
}

export async function getFallbackAuthorId(supabaseAdmin: SupabaseAdmin) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, username")
    .eq("id", CROSSPOST_FALLBACK_AUTHOR_ID)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.id) {
    throw new Error(`Fallback crosspost profile ${CROSSPOST_FALLBACK_AUTHOR_ID} was not found.`);
  }

  return String(profile.id);
}