import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "../auth";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ImportDraft = {
  name: string;
  description: string;
  address: string;
  country: string;
  placeName: string;
  price: number | null;
  rating: number | null;
  amenities: string[];
  websiteUrl: string;
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
    const jsonLd = parseJsonLd(html);
    const records = jsonLd.flatMap(flattenJsonLd);
    const hotelRecord = records.find((record) => /Hotel|LodgingBusiness|Campground|Resort|LocalBusiness/i.test(asText(record["@type"]))) ?? records[0];
    const addressText = hotelRecord ? asText(hotelRecord.address) : "";
    const description = asText(hotelRecord?.description) || getMeta(html, "name", "description") || getMeta(html, "property", "og:description");
    const price = extractLowestPrice(records, html);
    const rating = firstNumber(hotelRecord?.aggregateRating, hotelRecord?.reviewRating);

    const draft: ImportDraft = {
      name: asText(hotelRecord?.name) || getTitle(html).split("|")[0].trim(),
      description,
      address: addressText,
      country: "",
      placeName: "",
      price,
      rating,
      amenities: collectAmenities(html, records),
      websiteUrl: websiteUrl.toString(),
      warnings: [],
    };

    if (!draft.price) draft.warnings.push("No lowest price was found on the website. Add the lowest public website price manually before saving.");
    if (!draft.description) draft.warnings.push("No description metadata was found. Copy the stay description from the website manually.");
    if (!draft.address) draft.warnings.push("No structured address was found. Add the address manually.");

    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this website." },
      { status: 500 },
    );
  }
}