import { NextResponse } from "next/server";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { isUsernameValid, normalizeUsername } from "@/lib/username";

const DISCORD_PROVIDER = "discord";
const BAREUNITY_GUILD_ID = "1514974981711462561";
const BAREUNITY_VERIFIED_ROLE_ID = "1518175366395596860";
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

type DiscordMembershipCheck = {
  guildId: string;
  guildName: string;
  allowedRoleIds: string[];
  missingGuildMessage: string;
  missingRoleMessage: string;
};

type DiscordMembershipResult =
  | { ok: true; guildName: string }
  | { ok: false; message: string };

async function checkDiscordMembership(
  botToken: string,
  discordUserId: string,
  check: DiscordMembershipCheck,
): Promise<DiscordMembershipResult> {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${check.guildId}/members/${discordUserId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return { ok: false, message: check.missingGuildMessage };
  }

  if (!response.ok) {
    throw new Error(
      `Discord member check for ${check.guildName} failed with status ${response.status}.`,
    );
  }

  const member = (await response.json()) as { roles?: unknown };
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const hasAllowedRole = roles.some(
    (roleId) =>
      typeof roleId === "string" && check.allowedRoleIds.includes(roleId),
  );

  if (!hasAllowedRole) {
    return { ok: false, message: check.missingRoleMessage };
  }

  return { ok: true, guildName: check.guildName };
}

async function ensureApprovedDiscordMembership(discordUserId: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }

  const checks: DiscordMembershipCheck[] = [
    {
      guildId: BAREUNITY_GUILD_ID,
      guildName: "BareUnity",
      allowedRoleIds: [BAREUNITY_VERIFIED_ROLE_ID],
      missingGuildMessage:
        "Your Discord account is not a member of the BareUnity server.",
      missingRoleMessage:
        "Your Discord account does not have the verified BareUnity role yet.",
    },
    {
      guildId: TEAMNATURIST_GUILD_ID,
      guildName: "TeamNaturist",
      allowedRoleIds: TEAMNATURIST_ROLE_IDS,
      missingGuildMessage:
        "Your Discord account is not a member of the TeamNaturist server.",
      missingRoleMessage:
        "Your Discord account does not have an approved TeamNaturist role.",
    },
  ];

  const denialMessages: string[] = [];

  for (const check of checks) {
    const result = await checkDiscordMembership(botToken, discordUserId, check);
    if (result.ok) return result.guildName;
    denialMessages.push(result.message);
  }

  throw new DiscordInviteRegistrationError(
    [
      "Your Discord account must have the verified BareUnity role or an approved TeamNaturist role.",
      ...denialMessages,
    ].join(" "),
  );
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
      {
        error:
          "Sign in with Discord before completing BareUnity verified registration.",
      },
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
    const verificationSource =
      await ensureApprovedDiscordMembership(discordUserId);

    const username = await generateUniqueUsername(
      supabaseAdmin,
      normalizedUsername,
    );
    const metadata = {
      account_access: "verified",
      discord_user_id: discordUserId,
      discord_verification_source: verificationSource,
      display_name: fullName,
      full_name: fullName,
      onboarding_level: "registration_submitted",
      username,
      verification_status: "approved",
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
      message: "Discord verified registration complete.",
    });
  } catch (error) {
    if (error instanceof DiscordInviteRegistrationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Discord verified registration failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not complete Discord verified registration.",
      },
      { status: 500 },
    );
  }
}
