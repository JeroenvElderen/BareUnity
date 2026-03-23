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

type CreateMapSpotPayload = {
  name?: unknown;
  shortDescription?: unknown;
  fullDescription?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  locationHint?: unknown;
  country?: unknown;
  region?: unknown;
  accessType?: unknown;
  terrain?: unknown;
  clothingPolicy?: unknown;
  safetyLevel?: unknown;
  bestSeason?: unknown;
  entryFee?: unknown;
  website?: unknown;
  rules?: unknown;
  amenities?: unknown;
  tags?: unknown;
  reporterNotes?: unknown;
};

type NormalizedMapSpotPayload = {
  name: string;
  shortDescription: string | null;
  fullDescription: string;
  latitude: number;
  longitude: number;
  locationHint: string | null;
  country: string | null;
  region: string | null;
  accessType: string;
  terrain: string;
  clothingPolicy: string;
  safetyLevel: string;
  bestSeason: string;
  entryFee: string | null;
  website: string | null;
  rules: string | null;
  amenities: string[];
  tags: string[];
  reporterNotes: string | null;
};

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeCreatePayload(input: CreateMapSpotPayload): NormalizedMapSpotPayload {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (!name) {
    throw new Error("Location name is required.");
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Valid latitude and longitude are required.");
  }

  const tags = Array.isArray(input.tags)
    ? input.tags.filter((value): value is string => typeof value === "string").map((tag) => tag.trim()).filter(Boolean)
    : [];
  const amenities = Array.isArray(input.amenities)
    ? input.amenities
        .filter((value): value is string => typeof value === "string")
        .map((amenity) => amenity.trim())
        .filter(Boolean)
    : [];

  return {
    name,
    shortDescription: toOptionalString(input.shortDescription),
    fullDescription: toOptionalString(input.fullDescription) ?? "",
    latitude,
    longitude,
    locationHint: toOptionalString(input.locationHint),
    country: toOptionalString(input.country),
    region: toOptionalString(input.region),
    accessType: toOptionalString(input.accessType) ?? "Public",
    terrain: toOptionalString(input.terrain) ?? "Beach",
    clothingPolicy: toOptionalString(input.clothingPolicy) ?? "Clothing optional",
    safetyLevel: toOptionalString(input.safetyLevel) ?? "Beginner friendly",
    bestSeason: toOptionalString(input.bestSeason) ?? "Summer",
    entryFee: toOptionalString(input.entryFee),
    website: toOptionalString(input.website),
    rules: toOptionalString(input.rules),
    amenities,
    tags,
    reporterNotes: toOptionalString(input.reporterNotes),
  };
}

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

async function createSpotWithPrisma(payload: NormalizedMapSpotPayload) {
  return db.naturist_map_spots.create({
    data: {
      name: payload.name,
      description: payload.fullDescription || payload.shortDescription || payload.name,
      short_description: payload.shortDescription,
      latitude: payload.latitude,
      longitude: payload.longitude,
      privacy: payload.accessType,
      location_hint: payload.locationHint,
      country: payload.country,
      region: payload.region,
      access_type: payload.accessType,
      terrain: payload.terrain,
      clothing_policy: payload.clothingPolicy,
      safety_level: payload.safetyLevel,
      best_season: payload.bestSeason,
      entry_fee: payload.entryFee,
      website: payload.website,
      rules: payload.rules,
      amenities: payload.amenities,
      tags: payload.tags,
      reporter_notes: payload.reporterNotes,
      details: {
        locationHint: payload.locationHint,
        country: payload.country,
        region: payload.region,
        accessType: payload.accessType,
        terrain: payload.terrain,
        clothingPolicy: payload.clothingPolicy,
        safetyLevel: payload.safetyLevel,
        bestSeason: payload.bestSeason,
        entryFee: payload.entryFee,
        website: payload.website,
        rules: payload.rules,
        amenities: payload.amenities,
        tags: payload.tags,
        reporterNotes: payload.reporterNotes,
      },
    },
    select: { id: true },
  });
}

async function createSpotWithSupabaseAdmin(payload: NormalizedMapSpotPayload) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("naturist_map_spots")
    .insert({
      name: payload.name,
      description: payload.fullDescription || payload.shortDescription || payload.name,
      short_description: payload.shortDescription,
      latitude: payload.latitude,
      longitude: payload.longitude,
      privacy: payload.accessType,
      location_hint: payload.locationHint,
      country: payload.country,
      region: payload.region,
      access_type: payload.accessType,
      terrain: payload.terrain,
      clothing_policy: payload.clothingPolicy,
      safety_level: payload.safetyLevel,
      best_season: payload.bestSeason,
      entry_fee: payload.entryFee,
      website: payload.website,
      rules: payload.rules,
      amenities: payload.amenities,
      tags: payload.tags,
      reporter_notes: payload.reporterNotes,
      details: {
        locationHint: payload.locationHint,
        country: payload.country,
        region: payload.region,
        accessType: payload.accessType,
        terrain: payload.terrain,
        clothingPolicy: payload.clothingPolicy,
        safetyLevel: payload.safetyLevel,
        bestSeason: payload.bestSeason,
        entryFee: payload.entryFee,
        website: payload.website,
        rules: payload.rules,
        amenities: payload.amenities,
        tags: payload.tags,
        reporterNotes: payload.reporterNotes,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Supabase fallback failed: ${error.message}`);
  }

  return data;
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

export async function POST(request: Request) {
  try {
    const rawPayload = (await request.json()) as CreateMapSpotPayload;
    const payload = normalizeCreatePayload(rawPayload);

    try {
      const created = await createSpotWithPrisma(payload);
      return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (prismaError) {
      console.error("Failed to create map spot with Prisma", prismaError);

      if (isSupabaseAdminConfigured) {
        try {
          const created = await createSpotWithSupabaseAdmin(payload);
          return NextResponse.json({ id: created.id, source: "supabase-admin-fallback" }, { status: 201 });
        } catch (supabaseError) {
          console.error("Failed to create map spot with Supabase admin fallback", supabaseError);
        }
      }

      return NextResponse.json(
        {
          error:
            "Unable to create map spot. Ensure DATABASE_URL is configured or add NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for fallback writes.",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}