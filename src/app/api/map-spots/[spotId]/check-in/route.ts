import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";

type RouteContext = {
  params: Promise<{ spotId: string }>;
};

type DetailsRecord = Record<string, unknown>;

function asDetailsRecord(value: unknown): DetailsRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DetailsRecord) : {};
}

function readCheckIns(details: DetailsRecord) {
  const rawValue = details.checkIns;
  const value = typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function incrementWithPrisma(spotId: string) {
  const spot = await db.naturist_map_spots.findUnique({
    where: { id: spotId },
    select: { details: true },
  });

  if (!spot) return null;

  const details = asDetailsRecord(spot.details);
  const checkIns = readCheckIns(details) + 1;

  await db.naturist_map_spots.update({
    where: { id: spotId },
    data: {
      details: {
        ...details,
        checkIns,
        lastCheckInAt: new Date().toISOString(),
      },
    },
  });

  return checkIns;
}

async function incrementWithSupabaseAdmin(spotId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: spot, error: readError } = await supabaseAdmin
    .from("naturist_map_spots")
    .select("details")
    .eq("id", spotId)
    .single();

  if (readError) throw new Error(`Supabase fallback read failed: ${readError.message}`);

  const details = asDetailsRecord(spot?.details);
  const checkIns = readCheckIns(details) + 1;
  const { error: updateError } = await supabaseAdmin
    .from("naturist_map_spots")
    .update({
      details: {
        ...details,
        checkIns,
        lastCheckInAt: new Date().toISOString(),
      },
    })
    .eq("id", spotId);

  if (updateError) throw new Error(`Supabase fallback update failed: ${updateError.message}`);
  return checkIns;
}

export async function POST(request: Request, context: RouteContext) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "You must be logged in to check in." }, { status: 401 });
  }

  const { spotId } = await context.params;

  try {
    const checkIns = await incrementWithPrisma(spotId);
    if (checkIns === null) {
      return NextResponse.json({ error: "Map spot not found." }, { status: 404 });
    }

    return NextResponse.json({ checkInCount: checkIns });
  } catch (prismaError) {
    console.error("Failed to check in with Prisma", prismaError);

    if (isSupabaseAdminConfigured) {
      try {
        const checkIns = await incrementWithSupabaseAdmin(spotId);
        return NextResponse.json({ checkInCount: checkIns, source: "supabase-admin-fallback" });
      } catch (supabaseError) {
        console.error("Failed to check in with Supabase admin fallback", supabaseError);
      }
    }

    return NextResponse.json({ error: "Unable to save check-in." }, { status: 500 });
  }
}
