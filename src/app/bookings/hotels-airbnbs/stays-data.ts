import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export type Listing = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: "Hotel" | "Entire place" | "Boutique stay" | "Naturist camping";
  rating: number;
  price: number;
  badge: string;
  vibe: string;
  amenities: string[];
  description: string;
  websiteUrl: string;
  address: string;
  mapLatitude?: number;
  mapLongitude?: number;
  checkInWindow: string;
  gallery: string[];
  policies: Array<{
    category: string;
    items: string[];
  }>;
};

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/app/bookings/hotels-airbnbs/stays-data-store.json",
);

const STAY_COLUMNS =
  "slug,name,country,place_name,type,rating,price,badge,vibe,amenities,description,website_url,address,map_latitude,map_longitude,check_in_window,gallery,policies";

type StayRow = {
  slug: string;
  name: string;
  country: string | null;
  place_name: string | null;
  type: Listing["type"];
  rating: number | string | null;
  price: number | string | null;
  badge: string | null;
  vibe: string | null;
  amenities: string[] | null;
  description: string | null;
  website_url: string;
  address: string | null;
  map_latitude: number | string | null;
  map_longitude: number | string | null;
  check_in_window: string | null;
  gallery: string[] | null;
  policies: unknown;
};

async function readListingsFromDisk() {
  const raw = await readFile(DATA_FILE_PATH, "utf8");
  return JSON.parse(raw) as Listing[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanStrings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizePolicies(value: unknown): Listing["policies"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((policy) => {
      const record = isRecord(policy) ? policy : null;
      return {
        category:
          typeof record?.category === "string" ? record.category.trim() : "",
        items: cleanStrings(record?.items),
      };
    })
    .filter((policy) => policy.category && policy.items.length);
}

function listingFromStayRow(row: StayRow): Listing {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country ?? "",
    placeName: row.place_name ?? "",
    type: row.type,
    rating: readNumber(row.rating),
    price: readNumber(row.price),
    badge: row.badge ?? "",
    vibe: row.vibe ?? "",
    amenities: row.amenities ?? [],
    description: row.description ?? "",
    websiteUrl: row.website_url,
    address: row.address ?? "",
    mapLatitude: readOptionalNumber(row.map_latitude),
    mapLongitude: readOptionalNumber(row.map_longitude),
    checkInWindow: row.check_in_window ?? "",
    gallery: row.gallery ?? [],
    policies: normalizePolicies(row.policies),
  };
}

async function readListingsFromSupabase() {
  if (!isSupabaseAdminConfigured) return [];

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from("stays")
      .select(STAY_COLUMNS)
      .order("name", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as StayRow[]).map(listingFromStayRow);
  } catch (error) {
    console.error(
      "Failed to load Supabase stays. Run supabase-stays.sql to create the public.stays table.",
      error,
    );
    return [];
  }
}

export async function getListings() {
  const [diskListings, databaseListings] = await Promise.all([
    readListingsFromDisk(),
    readListingsFromSupabase(),
  ]);
  const listingsBySlug = new Map<string, Listing>();

  for (const listing of diskListings)
    listingsBySlug.set(listing.slug, listing);
  for (const listing of databaseListings)
    listingsBySlug.set(listing.slug, listing);

  return Array.from(listingsBySlug.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function getListingBySlug(slug: string) {
  const listings = await getListings();
  return listings.find((listing) => listing.slug === slug);
}
