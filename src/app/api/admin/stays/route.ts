import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "./auth";
import type { Listing } from "@/app/bookings/hotels-airbnbs/stays-data";

const DATA_FILE_PATH = path.join(process.cwd(), "src/app/bookings/hotels-airbnbs/stays-data-store.json");
const STAY_TYPES = new Set<Listing["type"]>(["Hotel", "Entire place", "Boutique stay", "Naturist camping"]);

type StayBody = Partial<Omit<Listing, "policies">> & {
  policies?: Array<{
    category?: string;
    items?: string[];
  }>;
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

function normalizeListing(body: StayBody): { listing?: Listing; error?: string } {
  const name = body.name?.trim() ?? "";
  const websiteUrl = body.websiteUrl?.trim() ?? "";
  const country = body.country?.trim() ?? "";
  const placeName = body.placeName?.trim() ?? "";
  const type = body.type;
  const rating = Number(body.rating);
  const price = Number(body.price);

  if (!name || !websiteUrl || !country || !placeName || !type) {
    return { error: "Name, website URL, country, place, and stay type are required." };
  }

  if (!STAY_TYPES.has(type)) return { error: "Choose a valid stay type." };
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return { error: "Rating must be between 0 and 5." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Price must be the lowest website price and greater than 0." };

  try {
    const parsedUrl = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
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

  if (!amenities.length) return { error: "Add at least one amenity copied from the stay website." };
  if (!body.description?.trim()) return { error: "Description is required." };
  if (!body.address?.trim()) return { error: "Address is required." };

  return {
    listing: {
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
      checkInWindow: body.checkInWindow?.trim() || "Check the stay website for current arrival times",
      policies,
      gallery,
    },
  };
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

  const normalized = normalizeListing(body);
  if (!normalized.listing) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const listings = await readListings();
  if (listings.some((listing) => listing.slug === normalized.listing?.slug)) {
    return NextResponse.json({ error: "A stay with this slug already exists." }, { status: 409 });
  }

  const nextListings = [...listings, normalized.listing].sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(DATA_FILE_PATH, `${JSON.stringify(nextListings, null, 2)}\n`, "utf8");

  return NextResponse.json({ ok: true, listing: normalized.listing });
}