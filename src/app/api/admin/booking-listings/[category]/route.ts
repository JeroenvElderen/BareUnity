import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "@/app/api/admin/stays/auth";
import type { BookingListing } from "@/components/bookings/booking-listing-types";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";
import {
  readBookingListingsFromDisk,
  slugifyBookingListing,
  sortBookingListings,
} from "@/lib/booking-data";

type Params = { params: Promise<{ category: string }> };

type Body = Partial<BookingListing>;

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NormalizedBookingListing = {
  listing: BookingListing;
  coordinates: Coordinates;
};

type GeocodeResult = {
  lat?: string;
  lon?: string;
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: { lat?: number; lng?: number };
    };
  }>;
};

const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const CONFIG = {
  activities: {
    filePath: path.join(
      process.cwd(),
      "src/app/bookings/activities/activities-data-store.json",
    ),
    allowedTypes: new Set([
      "Class",
      "Workshop",
      "Excursion",
      "Event",
      "Retreat",
    ]),
    terrain: "Activity",
    markerSource: "activity-listing",
    mapType: "Activity",
    markerTags: ["activities", "events", "bookings"],
    markerAmenity: "Hosted activity",
    markerFailureMessage:
      "Could not create the Explore map marker for this activity. The activity listing was not saved.",
  },
} as const;

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function uniqueGeocodeQueries(
  listing: Pick<BookingListing, "address" | "placeName" | "country" | "name">,
) {
  const queryParts = [
    [listing.address, listing.placeName, listing.country],
    [listing.name, listing.placeName, listing.country],
    [listing.name, listing.address],
    [listing.name, listing.country],
  ];

  const seen = new Set<string>();
  return queryParts
    .map((parts) => parts.filter(Boolean).join(", ").trim())
    .filter((query) => {
      const key = query.toLowerCase();
      if (!query || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function validateCoordinates(latitude: number, longitude: number) {
  if (latitude < -90 || latitude > 90)
    throw new Error("Map latitude must be between -90 and 90.");
  if (longitude < -180 || longitude > 180)
    throw new Error("Map longitude must be between -180 and 180.");
}

function coordinatesFromBody(body: Body) {
  const hasLatitude =
    body.mapLatitude !== undefined &&
    body.mapLatitude !== null &&
    String(body.mapLatitude).trim() !== "";
  const hasLongitude =
    body.mapLongitude !== undefined &&
    body.mapLongitude !== null &&
    String(body.mapLongitude).trim() !== "";

  if (!hasLatitude && !hasLongitude) return null;
  if (hasLatitude !== hasLongitude) {
    throw new Error(
      "Provide both map latitude and map longitude, or leave both blank for automatic geocoding.",
    );
  }

  const latitude = Number(body.mapLatitude);
  const longitude = Number(body.mapLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Map coordinates must be valid numbers.");
  }

  validateCoordinates(latitude, longitude);

  // 0,0 usually means the importer/model did not know the coordinates.
  // Geocode instead of persisting a Null Island marker.
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

async function geocodeBookingListingAddressWithGoogle(
  listing: Pick<BookingListing, "address" | "placeName" | "country" | "name">,
) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  for (const query of uniqueGeocodeQueries(listing)) {
    const url = new URL(GOOGLE_GEOCODE_URL);
    url.searchParams.set("address", query);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as GoogleGeocodeResponse;
      if (payload.status && payload.status !== "OK") {
        console.error("Google Geocoding could not geocode booking listing", {
          listingName: listing.name,
          query,
          status: payload.status,
          error: payload.error_message,
        });
        continue;
      }

      for (const result of payload.results ?? []) {
        const latitude = Number(result.geometry?.location?.lat);
        const longitude = Number(result.geometry?.location?.lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        validateCoordinates(latitude, longitude);
        if (latitude === 0 && longitude === 0) continue;
        return { latitude, longitude };
      }
    } catch (error) {
      console.error("Failed to geocode booking listing with Google", {
        listingName: listing.name,
        query,
        error,
      });
    }
  }

  return null;
}

async function geocodeBookingListingAddress(
  listing: Pick<BookingListing, "address" | "placeName" | "country" | "name">,
) {
  const googleCoordinates = await geocodeBookingListingAddressWithGoogle(listing);
  if (googleCoordinates) return googleCoordinates;

  for (const query of uniqueGeocodeQueries(listing)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "BareUnity booking marker geocoder (+https://bareunity.com)",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) continue;

      const results = (await response.json()) as GeocodeResult[];
      for (const result of results) {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        validateCoordinates(latitude, longitude);
        return { latitude, longitude };
      }
    } catch (error) {
      console.error("Failed to geocode booking listing address", {
        listingName: listing.name,
        query,
        error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function normalizePolicies(value: unknown): BookingListing["policies"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((policy) => {
      const record =
        policy && typeof policy === "object" && !Array.isArray(policy)
          ? (policy as Record<string, unknown>)
          : {};
      return {
        category:
          typeof record.category === "string" ? record.category.trim() : "",
        items: cleanStringArray(record.items),
      };
    })
    .filter((policy) => policy.category && policy.items.length);
}

async function normalizeListing(
  body: Body,
  allowedTypes: Set<string>,
): Promise<{ normalized?: NormalizedBookingListing; error?: string }> {
  const name = body.name?.trim() ?? "";
  const country = body.country?.trim() ?? "";
  const placeName = body.placeName?.trim() ?? "";
  const type = body.type?.trim() ?? "";
  const websiteUrl = body.websiteUrl?.trim() ?? "";
  const address = body.address?.trim() ?? "";
  const rating = Number(body.rating);
  const price = Number(body.price);

  if (!name || !country || !placeName || !type || !websiteUrl || !address) {
    return {
      error:
        "Name, country, place, type, website URL, and address are required.",
    };
  }
  if (!allowedTypes.has(type)) return { error: "Choose a valid listing type." };
  if (!Number.isFinite(rating) || rating < 0 || rating > 5)
    return { error: "Rating must be between 0 and 5." };
  if (!Number.isFinite(price) || price <= 0)
    return { error: "Price must be greater than 0." };
  try {
    const parsedUrl = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol))
      throw new Error("Invalid protocol");
  } catch {
    return { error: "Website URL must be a valid http(s) URL." };
  }

  const amenities = cleanStringArray(body.amenities);
  if (!amenities.length)
    return { error: "Add at least one amenity or inclusion." };
  if (!body.description?.trim()) return { error: "Description is required." };

  const listing: BookingListing = {
    slug: slugifyBookingListing(body.slug?.trim() || `${name}-${placeName}`),
    name,
    country,
    placeName,
    type,
    rating,
    price,
    badge: body.badge?.trim() || "Website-sourced listing",
    vibe: body.vibe?.trim() || "Website-sourced listing",
    amenities,
    description: body.description.trim(),
    websiteUrl,
    address,
    checkInWindow:
      body.checkInWindow?.trim() ||
      "Check the website for current availability",
    gallery: cleanStringArray(body.gallery),
    policies: normalizePolicies(body.policies),
  };

  let providedCoordinates: Coordinates | null = null;
  try {
    providedCoordinates = coordinatesFromBody(body);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Invalid map coordinates.",
    };
  }

  const coordinates =
    providedCoordinates ?? (await geocodeBookingListingAddress(listing));

  if (!coordinates) {
    return {
      error:
        "Could not automatically find map coordinates for this listing. We tried the address and the listing name with its place and country. Check those details before saving again.",
    };
  }

  listing.mapLatitude = coordinates.latitude;
  listing.mapLongitude = coordinates.longitude;

  return { normalized: { listing, coordinates } };
}

async function createBookingMapSpotWithPrisma(
  listing: BookingListing,
  coordinates: Coordinates,
  config: (typeof CONFIG)[keyof typeof CONFIG],
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
      terrain: config.terrain,
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(
        new Set([config.markerAmenity, ...listing.amenities]),
      ),
      tags: Array.from(new Set([...config.markerTags, listing.type])),
      reporter_notes: `Automatically created from the ${config.mapType.toLowerCase()} listing manager.`,
      details: {
        source: config.markerSource,
        type: config.mapType,
        listingSlug: listing.slug,
        listingType: listing.type,
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

async function createBookingMapSpotWithSupabaseAdmin(
  listing: BookingListing,
  coordinates: Coordinates,
  config: (typeof CONFIG)[keyof typeof CONFIG],
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
      terrain: config.terrain,
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(
        new Set([config.markerAmenity, ...listing.amenities]),
      ),
      tags: Array.from(new Set([...config.markerTags, listing.type])),
      reporter_notes: `Automatically created from the ${config.mapType.toLowerCase()} listing manager.`,
      details: {
        source: config.markerSource,
        type: config.mapType,
        listingSlug: listing.slug,
        listingType: listing.type,
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

async function createBookingMapSpot(
  listing: BookingListing,
  coordinates: Coordinates,
  config: (typeof CONFIG)[keyof typeof CONFIG],
) {
  try {
    return await createBookingMapSpotWithPrisma(listing, coordinates, config);
  } catch (prismaError) {
    console.error(
      "Failed to create booking map marker with Prisma",
      prismaError,
    );

    if (isSupabaseAdminConfigured) {
      return createBookingMapSpotWithSupabaseAdmin(
        listing,
        coordinates,
        config,
      );
    }

    throw prismaError;
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const { category } = await params;
  const config = CONFIG[category as keyof typeof CONFIG];
  if (!config)
    return NextResponse.json(
      { error: "Unknown booking category." },
      { status: 404 },
    );

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const normalized = await normalizeListing(body, config.allowedTypes);
  if (!normalized.normalized)
    return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { listing, coordinates } = normalized.normalized;
  const listings = await readBookingListingsFromDisk(config.filePath);
  if (
    listings.some((existingListing) => existingListing.slug === listing.slug)
  ) {
    return NextResponse.json(
      { error: "A listing with this slug already exists." },
      { status: 409 },
    );
  }

  let markerId: string;
  try {
    const marker = await createBookingMapSpot(listing, coordinates, config);
    markerId = marker.id;
  } catch (error) {
    console.error("Failed to create Explore marker for booking listing", error);
    return NextResponse.json(
      { error: config.markerFailureMessage },
      { status: 500 },
    );
  }

  const nextListings = sortBookingListings([...listings, listing]);
  await writeFile(
    config.filePath,
    `${JSON.stringify(nextListings, null, 2)}\n`,
    "utf8",
  );

  return NextResponse.json({ ok: true, listing, markerId });
}
