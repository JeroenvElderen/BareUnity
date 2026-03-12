import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CHANNEL_ADMIN_EMAIL } from "@/lib/channel-data";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ChannelPayload = {
  id?: string;
  name: string;
  slug: string;
  icon_url?: string | null;
  content_type: "forum" | "map" | "feed" | "events" | "custom";
  component_key: "general" | "retreats" | "mindful" | "map" | "custom";
  position: number;
  is_enabled: boolean;
};

function missingEnv() {
  return !supabaseUrl || !supabaseAnonKey || !serviceRoleKey;
}

async function requireOwner(request: NextRequest) {
  if (missingEnv()) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase env vars missing for admin API." }, { status: 500 }) };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl!, supabaseAnonKey!);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || (data.user?.email ?? "").toLowerCase() !== CHANNEL_ADMIN_EMAIL) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, service: createClient(supabaseUrl!, serviceRoleKey!) };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.service
    .from("channels")
    .select("id, name, slug, icon_url, content_type, content_config, position, is_enabled")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as ChannelPayload;
  const { error } = await auth.service.from("channels").insert({
    name: body.name,
    slug: body.slug,
    icon_url: body.icon_url ?? null,
    content_type: body.content_type,
    content_config: { component_key: body.component_key },
    position: body.position,
    is_enabled: body.is_enabled,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as ChannelPayload;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await auth.service
    .from("channels")
    .update({
      name: body.name,
      slug: body.slug,
      icon_url: body.icon_url ?? null,
      content_type: body.content_type,
      content_config: { component_key: body.component_key },
      position: body.position,
      is_enabled: body.is_enabled,
    })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await auth.service.from("channels").delete().eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
