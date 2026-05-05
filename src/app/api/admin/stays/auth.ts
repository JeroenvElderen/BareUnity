import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function ensureStayAdmin(request: NextRequest) {
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