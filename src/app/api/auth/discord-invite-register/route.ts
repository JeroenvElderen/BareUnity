import { NextResponse } from "next/server";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { isUsernameValid, normalizeUsername } from "@/lib/username";

const DISCORD_PROVIDER = "discord";
const TEAMNATURIST_GUILD_ID =
  process.env.DISCORD_TEAMNATURIST_GUILD_ID ?? "1130957278472835234";
const DEFAULT_TEAMNATURIST_ROLE_IDS = [
  "1131278113167388742",
  "1131284261748625510",
  "1130958613008089128",
  "1171098977043755138",
];
const TEAMNATURIST_ROLE_IDS = Array.from(
  new Set([
    ...DEFAULT_TEAMNATURIST_ROLE_IDS,
    ...(process.env.DISCORD_TEAMNATURIST_ROLE_IDS ?? "")
      .split(",")
      .map((roleId) => roleId.trim())
      .filter(Boolean),
  ]),
);

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type DiscordInviteRequestBody = {
  fullName?: unknown;
  username?: unknown;
};

class DiscordInviteRegistrationError extends Error {
  status = 403;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function parseBody(req: Request): Promise<DiscordInviteRequestBody> {
  const body = (await req.json().catch(() => ({}))) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
}

function getDiscordIdentity(user: { app_metadata?: unknown }) {
  const providers =
    user.app_metadata &&
    typeof user.app_metadata === "object" &&
    "providers" in user.app_metadata &&
    Array.isArray(user.app_metadata.providers)
      ? user.app_metadata.providers
      : [];

  return providers.includes(DISCORD_PROVIDER);
}

function getDiscordUserId(user: {
  identities?: unknown;
  user_metadata?: unknown;
}) {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const discordIdentity = identities.find((identity) => {
    return (
      identity &&
      typeof identity === "object" &&
      "provider" in identity &&
      identity.provider === DISCORD_PROVIDER
    );
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
    "provider_id" in user.user_metadata &&
    typeof user.user_metadata.provider_id === "string"
  ) {
    return user.user_metadata.provider_id;
  }

  return "";
}

async function ensureTeamNaturistDiscordRole(discordUserId: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${TEAMNATURIST_GUILD_ID}/members/${discordUserId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    throw new DiscordInviteRegistrationError(
      "Your Discord account is not a member of the TeamNaturist server.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Discord member check failed with status ${response.status}.`,
    );
  }

  const member = (await response.json()) as { roles?: unknown };
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const hasAllowedRole = roles.some(
    (roleId) =>
      typeof roleId === "string" && TEAMNATURIST_ROLE_IDS.includes(roleId),
  );

  if (!hasAllowedRole) {
    throw new DiscordInviteRegistrationError(
      "Your Discord account does not have an approved TeamNaturist role.",
    );
  }
}

async function generateUniqueUsername(
  supabaseAdmin: SupabaseAdminClient,
  normalizedUsername: string,
) {
  const { data: baseMatch, error: baseError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", normalizedUsername)
    .limit(1);

  if (baseError) throw new Error(baseError.message);
  if (!baseMatch?.length) return normalizedUsername;

  const base =
    normalizedUsername.slice(0, 20).replace(/[-_]+$/g, "") || "naturist";

  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 24);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .limit(1);

    if (error) throw new Error(error.message);
    if (!data?.length) return candidate;
  }

  return `${base.slice(0, 19)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const body = await parseBody(req);
  const fullName = normalizeString(body.fullName);
  const usernameInput = normalizeString(body.username);

  if (!fullName || !usernameInput) {
    return NextResponse.json(
      { error: "Name and username are required." },
      { status: 400 },
    );
  }

  const normalizedUsername = normalizeUsername(usernameInput);
  if (!normalizedUsername || !isUsernameValid(normalizedUsername)) {
    return NextResponse.json(
      {
        error:
          "Username must use 3-24 lowercase letters, numbers, underscores, or hyphens.",
      },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
  }

  if (!getDiscordIdentity(userData.user)) {
    return NextResponse.json(
      { error: "Sign in with Discord before redeeming this invite." },
      { status: 403 },
    );
  }

  const discordUserId = getDiscordUserId(userData.user);
  if (!discordUserId) {
    return NextResponse.json(
      { error: "Could not read your Discord user ID from Supabase Auth." },
      { status: 403 },
    );
  }

  const userId = userData.user.id;

  try {
    await ensureTeamNaturistDiscordRole(discordUserId);

    const username = await generateUniqueUsername(
      supabaseAdmin,
      normalizedUsername,
    );
    const metadata = {
      account_access: "invite",
      discord_user_id: discordUserId,
      display_name: fullName,
      full_name: fullName,
      onboarding_level: "registration_submitted",
      username,
      verification_status: "trusted_partner_invite",
    };

    const { error: updateUserError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(userData.user.user_metadata ?? {}),
          ...metadata,
        },
      });

    if (updateUserError) throw new Error(updateUserError.message);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        username,
        display_name: fullName,
      });

    if (profileError) throw new Error(profileError.message);

    const { error: settingsError } = await supabaseAdmin
      .from("profile_settings")
      .upsert(
        {
          user_id: userId,
          user_role: "newcomer",
          onboarding_completed: true,
          recovery_keys: [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (settingsError) throw new Error(settingsError.message);

    return NextResponse.json({
      message: "Discord invite registration complete.",
    });
  } catch (error) {
    if (error instanceof DiscordInviteRegistrationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Discord invite registration failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not complete Discord invite registration.",
      },
      { status: 500 },
    );
  }
}
