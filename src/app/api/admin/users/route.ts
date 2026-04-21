import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { isUsernameValid, normalizeUsername } from "@/lib/username";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type CreateUserBody = {
  email?: string;
  password?: string;
  displayName?: string;
  username?: string;
};

type UserListItem = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  username: string | null;
  displayName: string | null;
};

async function ensureAdmin(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: NextResponse.json({ error: "Supabase public auth config missing." }, { status: 500 }) };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return { error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }) };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) return { error: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }) };
  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true as const };
}

function hasStrongPassword(password: string) {
  if (password.length < 12) return false;

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^\w\s]/.test(password);

  return hasUppercase && hasLowercase && hasNumber && hasSymbol;
}

async function generateUniqueUsername(supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>, value: string) {
  const base = normalizeUsername(value) || "naturist";

  const { data: baseMatch } = await supabaseAdmin.from("profiles").select("id").eq("username", base).limit(1);
  if (!baseMatch?.length) return base;

  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("username", candidate).limit(1);

    if (!data?.length) {
      return candidate;
    }
  }

  return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() ?? "";
  const usernameInput = body.username?.trim() ?? "";
  const normalizedUsername = normalizeUsername(usernameInput || displayName || email.split("@")[0] || "naturist");

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: "Email, password, and display name are required." }, { status: 400 });
  }

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!hasStrongPassword(password)) {
    return NextResponse.json(
      {
        error: "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  if (!normalizedUsername || !isUsernameValid(normalizedUsername)) {
    return NextResponse.json(
      { error: "Username must use lowercase letters, numbers, underscores, or hyphens." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const username = await generateUniqueUsername(supabaseAdmin, normalizedUsername);

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
    },
  });

  if (createUserError || !createdUser.user) {
    return NextResponse.json({ error: createUserError?.message ?? "Could not create auth user." }, { status: 400 });
  }

  const userId = createdUser.user.id;

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    username,
    display_name: displayName,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: userId, email, username, displayName },
  });
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const supabaseAdmin = createSupabaseAdminClient();
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();

  const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (authUsersError) {
    return NextResponse.json({ error: authUsersError.message }, { status: 500 });
  }

  const users = authUsers?.users ?? [];
  const userIds = users.map((entry) => entry.id);

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, display_name")
    .in("id", userIds);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const filtered = users
    .map<UserListItem>((entry) => {
      const profile = profileMap.get(entry.id);

      return {
        id: entry.id,
        email: entry.email ?? null,
        createdAt: entry.created_at ?? null,
        lastSignInAt: entry.last_sign_in_at ?? null,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
      };
    })
    .filter((entry) => {
      if (!query) return true;

      const searchable = [entry.email, entry.username, entry.displayName, entry.id].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(query);
    })
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 80);

  return NextResponse.json({ users: filtered });
}