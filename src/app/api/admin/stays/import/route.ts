import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "../auth";
import type { Listing } from "@/app/bookings/hotels-airbnbs/stays-data";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type PolicyDraft = {
  category: string;
  items: string[];
};

type ImportDraft = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: Listing["type"];
  rating: number | null;
  price: number | null;
  badge: string;
  vibe: string;
  amenities: string[];
  description: string;
  websiteUrl: string;
  address: string;
  checkInWindow: string;
  policies: PolicyDraft[];
  gallery: string[];
  warnings: string[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function getMeta(html: string, selector: "name" | "property", key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+${selector}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${selector}=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return "";
}

function getTitle(html: string) {
  const ogTitle = getMeta(html, "property", "og:title");
  if (ogTitle) return ogTitle;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeHtml(title.replace(/\s+/g, " "));
}

function parseJsonLd(html: string) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values: JsonValue[] = [];

  for (const script of scripts) {
    const raw = script[1]?.trim();
    if (!raw) continue;

    try {
      values.push(JSON.parse(raw) as JsonValue);
    } catch {
      // Ignore invalid schema blocks; many hotel sites include malformed third-party JSON-LD.
    }
  }

  return values;
}

function flattenJsonLd(value: JsonValue): Record<string, JsonValue>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, JsonValue>;
  const graph = record["@graph"];
  return [record, ...(graph ? flattenJsonLd(graph) : [])];
}

function asText(value: JsonValue | undefined): string {
  if (typeof value === "string") return decodeHtml(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return Object.values(value).map(asText).filter(Boolean).join(", ");
  return "";
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : null;
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

function uniqueStrings(values: Array<string | false | null | undefined>) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function absolutizeUrl(value: string, baseUrl: URL) {
  try {
    return new URL(decodeHtml(value), baseUrl).toString();
  } catch {
    return "";
  }
}

function extractAddressParts(address: JsonValue | undefined, addressText: string) {
  const record = asRecord(address);
  const country = asText(record?.addressCountry).replace(/^[A-Z]{2}$/, (code) => {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  });
  const locality = asText(record?.addressLocality);
  const region = asText(record?.addressRegion);
  const cityRegion = uniqueStrings([locality, region]).join(" · ");

  if (country || cityRegion) {
    return {
      country,
      placeName: cityRegion,
    };
  }

  const parts = addressText.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    country: parts.at(-1) ?? "",
    placeName: uniqueStrings(parts.slice(-3, -1).map((part) => part.replace(/^\d{4,6}\s*/, ""))).join(" · "),
  };
}

function inferStayType(records: Record<string, JsonValue>[], htmlText: string): Listing["type"] {
  const typeText = `${records.map((record) => asText(record["@type"])).join(" ")} ${htmlText}`;
  if (/camping|campground|camp site|campsite|pitch|glamping|naturist|nudist/i.test(typeText)) return "Naturist camping";
  if (/apartment|villa|holiday home|vacation rental|entire place|airbnb|cottage|chalet/i.test(typeText)) return "Entire place";
  if (/boutique|guesthouse|b&b|bed and breakfast|inn/i.test(typeText)) return "Boutique stay";
  return "Hotel";
}

function extractCheckInWindow(record: Record<string, JsonValue> | undefined, htmlText: string) {
  const checkIn = asText(record?.checkinTime ?? record?.checkInTime);
  const checkOut = asText(record?.checkoutTime ?? record?.checkOutTime);
  if (checkIn || checkOut) return uniqueStrings([checkIn && `Check-in ${checkIn}`, checkOut && `Check-out ${checkOut}`].filter(Boolean)).join(" · ");

  const checkInMatch = htmlText.match(/check[- ]?in[^0-9]{0,40}(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)/i)?.[1];
  const checkOutMatch = htmlText.match(/check[- ]?out[^0-9]{0,40}(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)/i)?.[1];
  if (checkInMatch || checkOutMatch) {
    return uniqueStrings([checkInMatch && `Check-in from ${checkInMatch}`, checkOutMatch && `Check-out by ${checkOutMatch}`].filter(Boolean)).join(" · ");
  }

  return "Check-in afternoon · Check-out morning";
}

function collectGallery(html: string, records: Record<string, JsonValue>[], baseUrl: URL) {
  const imageCandidates = records.flatMap((record) => [record.image, record.photo, record.logo].map((value) => asText(value)));
  imageCandidates.push(getMeta(html, "property", "og:image"));
  imageCandidates.push(...[...html.matchAll(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1] ?? ""));
  imageCandidates.push(...[...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1] ?? ""));

  return uniqueStrings(
    imageCandidates
      .flatMap((value) => value.split(","))
      .map((value) => absolutizeUrl(value, baseUrl))
      .filter((value) => /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i.test(value)),
  ).slice(0, 8);
}

function buildBadge(type: Listing["type"], amenities: string[]) {
  if (amenities.some((amenity) => /wellness|spa|sauna/i.test(amenity))) return "Wellness & relaxation stay";
  if (amenities.some((amenity) => /beach|dune|coast/i.test(amenity))) return "Beach and nature escape";
  if (type === "Naturist camping") return "Naturist camping escape";
  if (type === "Boutique stay") return "Boutique website find";
  return "Website-sourced stay";
}

function buildVibe(type: Listing["type"], placeName: string, amenities: string[]) {
  const highlights = amenities.filter((amenity) => /pool|sauna|spa|beach|restaurant|bar|garden|terrace|cycling|playground|parking/i.test(amenity)).slice(0, 3);
  return uniqueStrings([type, placeName, ...highlights]).join(" · ") || "Website-sourced listing";
}

function buildPolicies(checkInWindow: string, type: Listing["type"]): PolicyDraft[] {
  return [
    {
      category: "Check-in and check-out",
      items: uniqueStrings([checkInWindow, "Arrival times coordinated via the official website or reception", "Late arrival subject to property approval"]),
    },
    {
      category: "Cancellation",
      items: ["Cancellation terms depend on the selected rate and booking dates", "Seasonal conditions may apply", "Refunds are handled according to the property's reservation terms"],
    },
    {
      category: "Accepted payment methods",
      items: ["Payment methods are confirmed on the official booking website", "Advance payment may be required", "Additional services may be charged separately"],
    },
    {
      category: "Property policy",
      items: type === "Naturist camping"
        ? ["Naturist etiquette applies in designated areas", "Guests are expected to respect site rules and community standards", "Clothing rules may vary by area, weather, or activity"]
        : ["Guests are expected to follow property rules", "Quiet hours and shared-space etiquette may apply", "Facilities and services may vary by season"],
    },
    {
      category: "Security",
      items: ["Reception or host contact available according to opening hours", "Guests are responsible for personal belongings", "Emergency procedures are managed by the property"],
    },
    {
      category: "Pets",
      items: ["Pet rules must be confirmed with the property before booking", "Restrictions may apply by room or accommodation type", "Owners are responsible for behaviour and cleanliness"],
    },
  ];
}

function firstNumber(...values: Array<JsonValue | undefined>) {
  for (const value of values) {
    const text = asText(value);
    const match = text.match(/\d+(?:[.,]\d+)?/);
    if (match) return Number(match[0].replace(",", "."));
  }
  return null;
}

function extractLowestPrice(records: Record<string, JsonValue>[], html: string) {
  const prices: number[] = [];

  for (const record of records) {
    const offers = record.offers;
    const offerRecords = flattenJsonLd(offers ?? null);
    const candidates = offerRecords.length ? offerRecords : [record];

    for (const candidate of candidates) {
      const price = firstNumber(candidate.lowPrice, candidate.price, candidate.priceSpecification, candidate.minPrice);
      if (price !== null && Number.isFinite(price) && price > 0) prices.push(price);
    }
  }

  const htmlPriceHints = [
    ...html.matchAll(/(?:from|vanaf|ab|à partir de|starting at)[^€$£]{0,80}[€$£]\s*(\d+(?:[.,]\d+)?)/gi),
    ...html.matchAll(/[€$£]\s*(\d+(?:[.,]\d+)?)[^<]{0,80}(?:per night|\/ night|nacht|per nacht)/gi),
  ];

  for (const match of htmlPriceHints) {
    const price = Number(match[1]?.replace(",", "."));
    if (Number.isFinite(price) && price > 0) prices.push(price);
  }

  return prices.length ? Math.min(...prices) : null;
}

function collectAmenities(html: string, records: Record<string, JsonValue>[]) {
  const amenities = new Set<string>();

  for (const record of records) {
    const amenityFeature = record.amenityFeature;
    for (const feature of flattenJsonLd(amenityFeature ?? null)) {
      const name = asText(feature.name);
      if (name) amenities.add(name);
    }
  }

  const text = textFromHtml(html);
  const knownAmenities = [
    "WiFi",
    "Pool",
    "Sauna",
    "Restaurant",
    "Bar",
    "Parking",
    "Breakfast",
    "Spa",
    "Beach",
    "Terrace",
    "Garden",
    "Laundry",
    "Air conditioning",
    "Pets allowed",
    "Playground",
    "Bicycle rental",
  ];

  for (const amenity of knownAmenities) {
    if (new RegExp(`\\b${amenity.replace(/ /g, "\\s+")}\\b`, "i").test(text)) amenities.add(amenity);
  }

  return [...amenities].slice(0, 24);
}

export async function GET(request: NextRequest) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const url = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!url) return NextResponse.json({ error: "Missing website URL." }, { status: 400 });

  let websiteUrl: URL;
  try {
    websiteUrl = new URL(url);
    if (!["http:", "https:"].includes(websiteUrl.protocol)) throw new Error("Unsupported protocol");
  } catch {
    return NextResponse.json({ error: "Enter a valid http(s) website URL." }, { status: 400 });
  }

  try {
    const response = await fetch(websiteUrl, {
      headers: {
        "User-Agent": "BareUnity stay listing importer (+https://bareunity.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Website returned ${response.status}.` }, { status: 502 });
    }

    const html = await response.text();
    const htmlText = textFromHtml(html);
    const jsonLd = parseJsonLd(html);
    const records = jsonLd.flatMap(flattenJsonLd);
    const hotelRecord = records.find((record) => /Hotel|LodgingBusiness|Campground|Resort|LocalBusiness|BedAndBreakfast/i.test(asText(record["@type"]))) ?? records[0];
    const addressText = hotelRecord ? asText(hotelRecord.address) : "";
    const addressParts = extractAddressParts(hotelRecord?.address, addressText);
    const description = asText(hotelRecord?.description) || getMeta(html, "name", "description") || getMeta(html, "property", "og:description");
    const price = extractLowestPrice(records, html);
    const rating = firstNumber(asRecord(hotelRecord?.aggregateRating)?.ratingValue, hotelRecord?.aggregateRating, hotelRecord?.reviewRating);
    const amenities = collectAmenities(html, records);
    const type = inferStayType(records, htmlText);
    const name = asText(hotelRecord?.name) || getTitle(html).split(/[|—–-]/)[0].trim();
    const checkInWindow = extractCheckInWindow(hotelRecord, htmlText);
    const gallery = collectGallery(html, records, websiteUrl);

    const draft: ImportDraft = {
      slug: slugify(`${name}-${addressParts.placeName || addressParts.country || websiteUrl.hostname}`),
      name,
      country: addressParts.country,
      placeName: addressParts.placeName,
      type,
      rating,
      price,
      badge: buildBadge(type, amenities),
      vibe: buildVibe(type, addressParts.placeName, amenities),
      amenities,
      description,
      websiteUrl: websiteUrl.toString(),
      address: addressText,
      checkInWindow,
      policies: buildPolicies(checkInWindow, type),
      gallery,
      warnings: [],
    };

    if (!draft.name) draft.warnings.push("No stay name was found. Add the public property name manually before saving.");
    if (!draft.country) draft.warnings.push("No country was found. Add the stay country manually before saving.");
    if (!draft.placeName) draft.warnings.push("No city or region was found. Add the place / region manually before saving.");
    if (!draft.price) draft.warnings.push("No lowest price was found on the website. Add the lowest public website price manually before saving.");
    if (!draft.description) draft.warnings.push("No description metadata was found. Copy the stay description from the website manually.");
    if (!draft.address) draft.warnings.push("No structured address was found. Add the address manually.");
    if (!draft.amenities.length) draft.warnings.push("No amenities were detected. Add amenities copied from the website manually.");
    if (!draft.gallery.length) draft.warnings.push("No gallery images were detected. Add public image URLs from the website manually if available.");

    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this website." },
      { status: 500 },
    );
  }
}