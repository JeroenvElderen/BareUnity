import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  normalizeSidebarHiddenItems,
  sidebarHiddenItemsToArray,
} from "@/lib/sidebar-visibility";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const updateSchema = z.object({
  hiddenItems: z.unknown().transform((value) =>
    sidebarHiddenItemsToArray(normalizeSidebarHiddenItems(value)),
  ),
});

async function readHiddenItems() {
  if (!isSupabaseAdminConfigured) return [];

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("sidebar_hidden_items")
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;

  return sidebarHiddenItemsToArray(
    normalizeSidebarHiddenItems(data?.sidebar_hidden_items),
  );
}

export async function GET() {
  try {
    const hiddenItems = await readHiddenItems();
    return NextResponse.json({ hiddenItems });
  } catch (error) {
    console.debug("Could not load sidebar visibility settings", error);
    return NextResponse.json({ hiddenItems: [] });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAdminRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sidebar settings." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .upsert(
      {
        id: true,
        sidebar_hidden_items: parsed.data.hiddenItems,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("sidebar_hidden_items")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    hiddenItems: sidebarHiddenItemsToArray(
      normalizeSidebarHiddenItems(data.sidebar_hidden_items),
    ),
  });
}
