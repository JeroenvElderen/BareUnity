import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "./auth";
import {
  getListings,
  type Listing,
} from "@/app/bookings/hotels-airbnbs/stays-data";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/app/bookings/hotels-airbnbs/stays-data-store.json",
);
const CAN_WRITE_SOURCE_DATA =
  process.env.VERCEL !== "1" && !process.env.VERCEL_ENV;
const STAY_TYPES = new Set<Listing["type"]>([
  "Hotel",
  "Entire place",
  "Boutique stay",
  "Naturist camping",
]);
const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const MAPBOX_GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward";

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

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: { lat?: number; lng?: number };
    };
  }>;
};

type MapboxFeature = {
  geometry?: {
    coordinates?: unknown[];
  };
  properties?: {
    coordinates?: {
      latitude?: number;
      longitude?: number;
    };
  };
};

function uniqueGeocodeQueries(
  listing: Pick<Listing, "address" | "placeName" | "country" | "name">,
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
      if (!query || seen.has(query.toLowerCase())) return false;
      seen.add(query.toLowerCase());
      return true;
    });
}

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
  return getListings();
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

function coordinatesFromBody(body: StayBody) {
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

  // 0,0 is almost always a placeholder from import/AI output, not a real stay.
  // Let the normal geocoder run instead of creating a marker at Null Island.
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

function coordinatesFromMapboxFeature(feature: MapboxFeature) {
  const propertyCoordinates = feature.properties?.coordinates;
  const propertyLatitude = propertyCoordinates?.latitude;
  const propertyLongitude = propertyCoordinates?.longitude;

  if (
    typeof propertyLatitude === "number" &&
    typeof propertyLongitude === "number" &&
    Number.isFinite(propertyLatitude) &&
    Number.isFinite(propertyLongitude)
  ) {
    validateCoordinates(propertyLatitude, propertyLongitude);
    return { latitude: propertyLatitude, longitude: propertyLongitude };
  }

  const geometryCoordinates = feature.geometry?.coordinates;
  const geometryLongitude = Number(geometryCoordinates?.[0]);
  const geometryLatitude = Number(geometryCoordinates?.[1]);

  if (
    !Number.isFinite(geometryLatitude) ||
    !Number.isFinite(geometryLongitude)
  ) {
    return null;
  }

  validateCoordinates(geometryLatitude, geometryLongitude);
  return { latitude: geometryLatitude, longitude: geometryLongitude };
}

async function geocodeStayAddressWithGoogle(
  listing: Pick<Listing, "address" | "placeName" | "country" | "name">,
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
        console.error("Google Geocoding could not geocode stay address", {
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
      console.error("Failed to geocode stay address with Google", {
        listingName: listing.name,
        query,
        error,
      });
    }
  }

  return null;
}

async function geocodeStayAddressWithMapbox(
  listing: Pick<Listing, "address" | "placeName" | "country" | "name">,
) {
  if (!MAPBOX_ACCESS_TOKEN) return null;

  for (const query of uniqueGeocodeQueries(listing)) {
    const url = new URL(MAPBOX_GEOCODE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");
    url.searchParams.set("autocomplete", "false");
    url.searchParams.set("permanent", "true");
    url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as { features?: MapboxFeature[] };
      for (const feature of payload.features ?? []) {
        const coordinates = coordinatesFromMapboxFeature(feature);
        if (coordinates) return coordinates;
      }
    } catch (error) {
      console.error("Failed to geocode stay address with Mapbox", {
        listingName: listing.name,
        query,
        error,
      });
    }
  }

  return null;
}

async function geocodeStayAddress(
  listing: Pick<Listing, "address" | "placeName" | "country" | "name">,
) {
  const googleCoordinates = await geocodeStayAddressWithGoogle(listing);
  if (googleCoordinates) return googleCoordinates;

  const mapboxCoordinates = await geocodeStayAddressWithMapbox(listing);
  if (mapboxCoordinates) return mapboxCoordinates;

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
              "BareUnity stay marker geocoder (+https://bareunity.com)",
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
      console.error("Failed to geocode stay address", {
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
      terrain: "Stays",
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(new Set(["Overnight stay", ...listing.amenities])),
      tags: ["stays", listing.type],
      reporter_notes: "Automatically created from the stay listing manager.",
      details: {
        source: "stay-listing",
        type: "Stays",
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
      terrain: "Stays",
      clothing_policy: "Clothing optional",
      safety_level: "Beginner friendly",
      best_season: "Year-round",
      website: listing.websiteUrl,
      amenities: Array.from(new Set(["Overnight stay", ...listing.amenities])),
      tags: ["stays", listing.type],
      reporter_notes: "Automatically created from the stay listing manager.",
      details: {
        source: "stay-listing",
        type: "Stays",
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

async function createStayRecordWithSupabase(listing: Listing) {
  if (!isSupabaseAdminConfigured) {
    throw new Error(
      "Supabase admin env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("stays").insert({
    slug: listing.slug,
    name: listing.name,
    country: listing.country,
    place_name: listing.placeName,
    type: listing.type,
    rating: listing.rating,
    price: listing.price,
    badge: listing.badge,
    vibe: listing.vibe,
    amenities: listing.amenities,
    description: listing.description,
    website_url: listing.websiteUrl,
    address: listing.address,
    map_latitude: listing.mapLatitude,
    map_longitude: listing.mapLongitude,
    check_in_window: listing.checkInWindow,
    gallery: listing.gallery,
    policies: listing.policies,
  });

  if (error) {
    throw new Error(
      `${error.message}. Create or update public.stays with supabase-stays.sql before saving imported stays in production.`,
    );
  }
}

async function deleteStayRecordWithSupabase(slug: string) {
  if (!isSupabaseAdminConfigured) return;

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("stays").delete().eq("slug", slug);
  if (error) console.error("Failed to roll back Supabase stay record", error);
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
    providedCoordinates ?? (await geocodeStayAddress(listing));

  if (!coordinates) {
    return {
      error:
        "Could not automatically find map coordinates for this stay. We tried the address and the stay name with its place and country. Check those details before saving again.",
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

  let savedStayRecord = false;
  if (!CAN_WRITE_SOURCE_DATA) {
    try {
      await createStayRecordWithSupabase(listing);
      savedStayRecord = true;
    } catch (error) {
      console.error("Failed to save stay record to Supabase", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not save this stay to the Supabase stays table.",
        },
        { status: 500 },
      );
    }
  }

  let markerId: string;
  try {
    const marker = await createStayMapSpot(listing, coordinates);
    markerId = marker.id;
  } catch (error) {
    if (savedStayRecord) await deleteStayRecordWithSupabase(listing.slug);

    console.error("Failed to create Explore marker for stay", error);
    return NextResponse.json(
      {
        error:
          "Could not create the Explore map marker for this stay. The stay was not saved.",
      },
      { status: 500 },
    );
  }

  if (CAN_WRITE_SOURCE_DATA) {
    const nextListings = [...listings, listing].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    try {
      await writeFile(
        DATA_FILE_PATH,
        `${JSON.stringify(nextListings, null, 2)}\n`,
        "utf8",
      );
    } catch (error) {
      console.error("Failed to update local stays data store", error);
      return NextResponse.json(
        {
          error:
            "The Explore map marker was created, but the local stays data store could not be updated.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, listing, markerId });
}
