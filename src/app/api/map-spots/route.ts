import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { db } from "@/server/db";

type MapSpotPayload = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  privacy: string;
};

async function fetchSpotsWithPrisma(): Promise<MapSpotPayload[]> {
  return db.naturist_map_spots.findMany({
    orderBy: { created_at: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      latitude: true,
      longitude: true,
      privacy: true,
    },
  });
}

async function fetchSpotsWithSupabaseAdmin(): Promise<MapSpotPayload[]> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("naturist_map_spots")
    .select("id, name, description, latitude, longitude, privacy")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Supabase fallback failed: ${error.message}`);
  }

  return (data ?? []) as MapSpotPayload[];
}

export async function GET() {
  try {
    const spots = await fetchSpotsWithPrisma();

    return NextResponse.json({ spots });
  } catch (prismaError) {
    console.error("Failed to fetch map spots with Prisma", prismaError);

    if (isSupabaseAdminConfigured) {
      try {
        const spots = await fetchSpotsWithSupabaseAdmin();
        return NextResponse.json({ spots, source: "supabase-admin-fallback" });
      } catch (supabaseError) {
        console.error("Failed to fetch map spots with Supabase admin fallback", supabaseError);
      }
    }

    return NextResponse.json(
      {
        spots: [],
        error:
          "Unable to fetch map spots. Ensure DATABASE_URL is configured or add NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for fallback reads.",
      },
      { status: 500 },
    );
  }
}