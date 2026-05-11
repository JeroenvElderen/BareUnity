import { type NextRequest, NextResponse } from "next/server";

import { ensureStayAdmin } from "@/app/api/admin/stays/auth";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { db } from "@/server/db";
import { ensureMemberCanAct } from "@/lib/action-access";

type MapSpotPayload = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  privacy: string;
  access_type?: string | null;
  terrain: string | null;
  safety_level?: string | null;
  amenities?: string[];
  tags?: string[];
  details?: unknown;
  checkInCount: number;
  spotType: string;
  visitors: string;
  mood: string;
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

function detailsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberFromDetails(details: Record<string, unknown>, key: string) {
  const value = details[key];
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.floor(numberValue)
    : 0;
}

function resolveSpotType(spot: {
  terrain: string | null;
  access_type?: string | null;
  tags?: string[];
  details?: unknown;
}) {
  const details = detailsRecord(spot.details);
  const explicitType =
    typeof details.type === "string" ? details.type.trim() : "";
  const source =
    typeof details.source === "string" ? details.source.trim() : "";
  if (explicitType) return explicitType;
  if (
    source === "stay-listing" ||
    spot.tags?.some(
      (tag) => tag.toLowerCase() === "stays" || tag.toLowerCase() === "stay",
    )
  ) {
    return "Stays";
  }
  return spot.terrain || spot.access_type || "Location";
}

function resolveVisitors(checkInCount: number) {
  if (checkInCount >= 50) return "High";
  if (checkInCount >= 12) return "Medium";
  return "Low";
}

function resolveMood(
  spot: { privacy: string; access_type?: string | null },
  checkInCount: number,
) {
  const access = `${spot.privacy} ${spot.access_type ?? ""}`.toLowerCase();
  if (access.includes("discreet") || access.includes("private")) return "Calm";
  return checkInCount >= 12 ? "Active" : "Quiet";
}

function normalizeSpotPayload<
  T extends {
    id: string;
    name: string;
    description: string;
    latitude: number;
    longitude: number;
    privacy: string;
    access_type?: string | null;
    terrain: string | null;
    safety_level?: string | null;
    amenities?: string[];
    tags?: string[];
    details?: unknown;
  },
>(spot: T): MapSpotPayload {
  const details = detailsRecord(spot.details);
  const checkInCount = numberFromDetails(details, "checkIns");

  return {
    ...spot,
    checkInCount,
    spotType: resolveSpotType(spot),
    visitors: resolveVisitors(checkInCount),
    mood: resolveMood(spot, checkInCount),
  };
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeCreatePayload(
  input: CreateMapSpotPayload,
): NormalizedMapSpotPayload {
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
    ? input.tags
        .filter((value): value is string => typeof value === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
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
    clothingPolicy:
      toOptionalString(input.clothingPolicy) ?? "Clothing optional",
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
  const spots = await db.naturist_map_spots.findMany({
    orderBy: { created_at: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      latitude: true,
      longitude: true,
      privacy: true,
      access_type: true,
      terrain: true,
      safety_level: true,
      amenities: true,
      tags: true,
      details: true,
    },
  });

  return spots.map(normalizeSpotPayload);
}

async function fetchSpotsWithSupabaseAdmin(): Promise<MapSpotPayload[]> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("naturist_map_spots")
    .select(
      "id, name, description, latitude, longitude, privacy, access_type, terrain, safety_level, amenities, tags, details",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Supabase fallback failed: ${error.message}`);
  }

  return (
    (data ?? []) as Array<
      Omit<MapSpotPayload, "checkInCount" | "spotType" | "visitors" | "mood">
    >
  ).map(normalizeSpotPayload);
}

async function createSpotWithPrisma(
  payload: NormalizedMapSpotPayload,
  submittedBy: string,
) {
  return db.naturist_map_spots.create({
    data: {
      name: payload.name,
      description:
        payload.fullDescription || payload.shortDescription || payload.name,
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
      submitted_by: submittedBy,
      status: "approved",
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

async function createSpotWithSupabaseAdmin(
  payload: NormalizedMapSpotPayload,
  submittedBy: string,
) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("naturist_map_spots")
    .insert({
      name: payload.name,
      description:
        payload.fullDescription || payload.shortDescription || payload.name,
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
      submitted_by: submittedBy,
      status: "approved",
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
        console.error(
          "Failed to fetch map spots with Supabase admin fallback",
          supabaseError,
        );
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

export async function POST(request: NextRequest) {
  const admin = await ensureStayAdmin(request);
  if ("error" in admin) return admin.error;

  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json(
        { error: "You must be logged in to submit a map spot." },
        { status: 401 },
      );
    }

    const actionAccessError = await ensureMemberCanAct(viewerId);
    if (actionAccessError) return actionAccessError;

    const rawPayload = (await request.json()) as CreateMapSpotPayload;
    const payload = normalizeCreatePayload(rawPayload);

    try {
      const created = await createSpotWithPrisma(payload, viewerId);
      return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (prismaError) {
      console.error("Failed to create map spot with Prisma", prismaError);

      if (isSupabaseAdminConfigured) {
        try {
          const created = await createSpotWithSupabaseAdmin(payload, viewerId);
          return NextResponse.json(
            { id: created.id, source: "supabase-admin-fallback" },
            { status: 201 },
          );
        } catch (supabaseError) {
          console.error(
            "Failed to create map spot with Supabase admin fallback",
            supabaseError,
          );
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
