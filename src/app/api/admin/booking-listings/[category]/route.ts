import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "@/app/api/admin/stays/auth";
import type { BookingListing } from "@/components/bookings/booking-listing-types";
import {
  readBookingListingsFromDisk,
  slugifyBookingListing,
  sortBookingListings,
} from "@/lib/booking-data";

type Params = { params: Promise<{ category: string }> };

type Body = Partial<BookingListing>;

const CONFIG = {
  spas: {
    filePath: path.join(
      process.cwd(),
      "src/app/bookings/spas/spas-data-store.json",
    ),
    allowedTypes: new Set([
      "Day spa",
      "Wellness center",
      "Thermal spa",
      "Massage studio",
    ]),
    terrain: "Spa",
  },
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
  },
} as const;

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
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

function normalizeListing(body: Body, allowedTypes: Set<string>) {
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

  return { listing };
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

  const normalized = normalizeListing(body, config.allowedTypes);
  if (!normalized.listing)
    return NextResponse.json({ error: normalized.error }, { status: 400 });

  const listings = await readBookingListingsFromDisk(config.filePath);
  if (listings.some((listing) => listing.slug === normalized.listing.slug)) {
    return NextResponse.json(
      { error: "A listing with this slug already exists." },
      { status: 409 },
    );
  }

  const nextListings = sortBookingListings([...listings, normalized.listing]);
  await writeFile(
    config.filePath,
    `${JSON.stringify(nextListings, null, 2)}\n`,
    "utf8",
  );

  return NextResponse.json({ ok: true, listing: normalized.listing });
}
