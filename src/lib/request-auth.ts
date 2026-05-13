import { type User, createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { hasConfiguredPlatformAdmins, isPlatformAdminEmail } from "@/lib/platform-admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type AuthSuccess = { ok: true; user: User };
type AuthFailure = { error: NextResponse<{ error: string }> };

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export async function ensureAuthenticatedRequest(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      error: NextResponse.json({ error: "Supabase public auth config missing." }, { status: 500 }),
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }) };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return { error: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }) };
  }

  return { ok: true, user: data.user };
}

export async function ensureAdminRequest(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const authResult = await ensureAuthenticatedRequest(request);
  if ("error" in authResult) return authResult;

  if (!hasConfiguredPlatformAdmins()) {
    return { error: NextResponse.json({ error: "Admin access is not configured." }, { status: 500 }) };
  }

  if (!isPlatformAdminEmail(authResult.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return authResult;
}