import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "./auth";
import type { Listing } from "@/app/bookings/hotels-airbnbs/stays-data";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/app/bookings/hotels-airbnbs/stays-data-store.json",
);
const STAY_TYPES = new Set<Listing["type"]>([
  "Hotel",
  "Entire place",
  "Boutique stay",
  "Naturist camping",
]);

type StayBody = Partial<Omit<Listing, "policies">> & {
  policies?: Array<{
    category?: string;
    items?: string[];
  }>;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NormalizedStay = {
  listing: Listing;
  coordinates: Coordinates;
};

type GeocodeResult = {
  lat?: string;
  lon?: string;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function readListings() {
  const raw = await readFile(DATA_FILE_PATH, "utf8");
  return JSON.parse(raw) as Listing[];
}

function cleanStringArray(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function validateCoordinates(latitude: number, longitude: number) {
  if (latitude < -90 || latitude > 90)
    throw new Error("Map latitude must be between -90 and 90.");
  if (longitude < -180 || longitude > 180)
    throw new Error("Map longitude must be between -180 and 180.");
}

async function geocodeStayAddress(
  listing: Pick<Listing, "address" | "placeName" | "country" | "name">,
) {
  const query = [listing.address, listing.placeName, listing.country]
    .filter(Boolean)
    .join(", ");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "BareUnity stay marker geocoder (+https://bareunity.com)",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) return null;

    const results = (await response.json()) as GeocodeResult[];
    const first = results[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    validateCoordinates(latitude, longitude);
    return { latitude, longitude };
  } catch (error) {
    console.error(`Failed to geocode stay address for ${listing.name}`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createStayMapSpotWithPrisma(
  listing: Listing,
  coordinates: Coordinates,
) {
  return db.naturist_map_spots.create({
    data: {
      name: listing.name,
      description: listing.description,
      short_description: listing.vibe || listing.badge,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      privacy: "Public",
      location_hint: listing.address,
      country: listing.country,
      region: listing.placeName,
      access_type: "Public",
      terrain: "Resort",
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(new Set(["Overnight stay", ...listing.amenities])),
      tags: ["stay", listing.type],
      reporter_notes: "Automatically created from the stay listing manager.",
      details: {
        source: "stay-listing",
        staySlug: listing.slug,
        stayType: listing.type,
        price: listing.price,
        rating: listing.rating,
        badge: listing.badge,
        vibe: listing.vibe,
        checkInWindow: listing.checkInWindow,
      },
    },
    select: { id: true },
  });
}

async function createStayMapSpotWithSupabaseAdmin(
  listing: Listing,
  coordinates: Coordinates,
) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("naturist_map_spots")
    .insert({
      name: listing.name,
      description: listing.description,
      short_description: listing.vibe || listing.badge,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      privacy: "Public",
      location_hint: listing.address,
      country: listing.country,
      region: listing.placeName,
      access_type: "Public",
      terrain: "Resort",
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(new Set(["Overnight stay", ...listing.amenities])),
      tags: ["stay", listing.type],
      reporter_notes: "Automatically created from the stay listing manager.",
      details: {
        source: "stay-listing",
        staySlug: listing.slug,
        stayType: listing.type,
        price: listing.price,
        rating: listing.rating,
        badge: listing.badge,
        vibe: listing.vibe,
        checkInWindow: listing.checkInWindow,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Supabase fallback failed: ${error.message}`);
  return data;
}

async function createStayMapSpot(listing: Listing, coordinates: Coordinates) {
  try {
    return await createStayMapSpotWithPrisma(listing, coordinates);
  } catch (prismaError) {
    console.error("Failed to create stay map marker with Prisma", prismaError);

    if (isSupabaseAdminConfigured) {
      return createStayMapSpotWithSupabaseAdmin(listing, coordinates);
    }

    throw prismaError;
  }
}

async function normalizeListing(
  body: StayBody,
): Promise<{ normalized?: NormalizedStay; error?: string }> {
  const name = body.name?.trim() ?? "";
  const websiteUrl = body.websiteUrl?.trim() ?? "";
  const country = body.country?.trim() ?? "";
  const placeName = body.placeName?.trim() ?? "";
  const type = body.type;
  const rating = Number(body.rating);
  const price = Number(body.price);
  if (!name || !websiteUrl || !country || !placeName || !type) {
    return {
      error: "Name, website URL, country, place, and stay type are required.",
    };
  }

  if (!STAY_TYPES.has(type)) return { error: "Choose a valid stay type." };
  if (!Number.isFinite(rating) || rating < 0 || rating > 5)
    return { error: "Rating must be between 0 and 5." };
  if (!Number.isFinite(price) || price <= 0)
    return {
      error: "Price must be the lowest website price and greater than 0.",
    };

  try {
    const parsedUrl = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol))
      throw new Error("Invalid protocol");
  } catch {
    return { error: "Website URL must be a valid http(s) URL." };
  }

  const amenities = cleanStringArray(body.amenities);
  const gallery = cleanStringArray(body.gallery);
  const policies = (body.policies ?? [])
    .map((policy) => ({
      category: policy.category?.trim() ?? "",
      items: cleanStringArray(policy.items),
    }))
    .filter((policy) => policy.category && policy.items.length);

  if (!amenities.length)
    return { error: "Add at least one amenity copied from the stay website." };
  if (!body.description?.trim()) return { error: "Description is required." };
  if (!body.address?.trim()) return { error: "Address is required." };

  const listing: Listing = {
    slug: slugify(body.slug?.trim() || `${name}-${placeName}`),
    name,
    country,
    placeName,
    type,
    rating,
    price,
    badge: body.badge?.trim() || "Website-sourced stay",
    vibe: body.vibe?.trim() || "Website-sourced listing",
    amenities,
    description: body.description.trim(),
    websiteUrl,
    address: body.address.trim(),
    checkInWindow:
      body.checkInWindow?.trim() ||
      "Check the stay website for current arrival times",
    policies,
    gallery,
  };

  const coordinates = await geocodeStayAddress(listing);

  if (!coordinates) {
    return {
      error:
        "Could not automatically find map coordinates for this stay address. Check the address, place, and country before saving again.",
    };
  }

  listing.mapLatitude = coordinates.latitude;
  listing.mapLongitude = coordinates.longitude;

  return { normalized: { listing, coordinates } };
}

export async function POST(request: NextRequest) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  let body: StayBody;
  try {
    body = (await request.json()) as StayBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const normalized = await normalizeListing(body);
  if (!normalized.normalized)
    return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { listing, coordinates } = normalized.normalized;
  const listings = await readListings();
  if (
    listings.some((existingListing) => existingListing.slug === listing.slug)
  ) {
    return NextResponse.json(
      { error: "A stay with this slug already exists." },
      { status: 409 },
    );
  }

  let markerId: string;
  try {
    const marker = await createStayMapSpot(listing, coordinates);
    markerId = marker.id;
  } catch (error) {
    console.error("Failed to create Explore marker for stay", error);
    return NextResponse.json(
      {
        error:
          "Could not create the Explore map marker for this stay. The stay was not saved.",
      },
      { status: 500 },
    );
  }

  const nextListings = [...listings, listing].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  await writeFile(
    DATA_FILE_PATH,
    `${JSON.stringify(nextListings, null, 2)}\n`,
    "utf8",
  );

  return NextResponse.json({ ok: true, listing, markerId });
}
