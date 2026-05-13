import { type NextRequest, NextResponse } from "next/server";

import { ensureStayAdmin } from "@/app/api/admin/stays/auth";

type ImportCategory = "spa" | "activity";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ImportDraft = {
  name: string;
  shortDescription: string;
  fullDescription: string;
  latitude?: number;
  longitude?: number;
  locationHint: string;
  accessType: string;
  terrain: string;
  safetyLevel: string;
  website: string;
  websiteUrl: string;
  address: string;
  country: string;
  placeName: string;
  price: number;
  rating: number;
  badge: string;
  vibe: string;
  checkInWindow: string;
  gallery: string[];
  amenities: string[];
  policies: Array<{ category: string; items: string[] }>;
  tags: string[];
  reporterNotes: string;
  warnings: string[];
};

type GeocodeResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

const CATEGORY_CONFIG: Record<
  ImportCategory,
  {
    label: string;
    terrain: string;
    defaultAmenities: string[];
    tags: string[];
    keywords: string[];
  }
> = {
  spa: {
    label: "Spa / wellness",
    terrain: "Spa",
    defaultAmenities: ["Wellness services"],
    tags: ["spa", "wellness", "bookings"],
    keywords: [
      "spa",
      "wellness",
      "massage",
      "sauna",
      "thermal",
      "treatment",
      "relaxation",
      "bodywork",
    ],
  },
  activity: {
    label: "Activity",
    terrain: "Activity",
    defaultAmenities: ["Hosted activity"],
    tags: ["activity", "events", "bookings"],
    keywords: [
      "activity",
      "event",
      "tour",
      "class",
      "workshop",
      "excursion",
      "experience",
      "retreat",
    ],
  },
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = decodeHtml(value).trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textFromMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
    "i",
  );
  const match = html.match(regex);
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function titleFromHtml(html: string) {
  const ogTitle = textFromMeta(html, "og:title");
  if (ogTitle) return ogTitle;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeHtml(title.replace(/\s+[|–-]\s+.*$/, ""));
}

function descriptionFromHtml(html: string) {
  return (
    textFromMeta(html, "og:description") ||
    textFromMeta(html, "description") ||
    stripTags(html).slice(0, 280)
  );
}

function parseJsonLd(html: string) {
  const scripts =
    html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ) ?? [];
  return scripts
    .map((script) =>
      script
        .replace(/^<script[^>]*>/i, "")
        .replace(/<\/script>$/i, "")
        .trim(),
    )
    .flatMap((content) => {
      try {
        const parsed = JSON.parse(content) as JsonValue;
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    });
}

function asRecord(
  value: JsonValue | undefined,
): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" ? decodeHtml(value) : "";
}

function findJsonLdPlace(records: JsonValue[]) {
  const queue = [...records];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    const graph = record["@graph"];
    if (Array.isArray(graph)) queue.push(...graph);

    const type = stringValue(record["@type"]).toLowerCase();
    if (
      type.includes("localbusiness") ||
      type.includes("healthandbeautybusiness") ||
      type.includes("event") ||
      type.includes("place") ||
      type.includes("touristattraction")
    ) {
      return record;
    }
  }

  return null;
}

function addressFromJsonLd(record: Record<string, JsonValue> | null) {
  const address = record?.address;
  if (typeof address === "string") return decodeHtml(address);

  const addressRecord = asRecord(address);
  if (!addressRecord) return "";

  return uniqueStrings([
    stringValue(addressRecord.streetAddress),
    stringValue(addressRecord.addressLocality),
    stringValue(addressRecord.addressRegion),
    stringValue(addressRecord.postalCode),
    stringValue(addressRecord.addressCountry),
  ]).join(", ");
}

function geoFromJsonLd(record: Record<string, JsonValue> | null) {
  const geo = asRecord(record?.geo);
  if (!geo) return null;

  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function extractAmenityCandidates(text: string, keywords: string[]) {
  const lowerText = text.toLowerCase();
  return keywords
    .filter((keyword) => lowerText.includes(keyword))
    .map((keyword) => `${keyword.charAt(0).toUpperCase()}${keyword.slice(1)}`);
}

async function geocode(query: string) {
  if (!query) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "BareUnity bookings importer (+https://bareunity.com)",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) return null;

    const results = (await response.json()) as GeocodeResult[];
    const result = results[0];
    if (!result) return null;

    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      displayName: result.display_name ?? query,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  const categoryParam = request.nextUrl.searchParams.get("category")?.trim();
  const category: ImportCategory =
    categoryParam === "activity" ? "activity" : "spa";
  const config = CATEGORY_CONFIG[category];

  let websiteUrl: URL;
  try {
    websiteUrl = new URL(url);
    if (!["http:", "https:"].includes(websiteUrl.protocol)) {
      throw new Error("Unsupported protocol");
    }
  } catch {
    return NextResponse.json(
      { error: "Enter a valid http(s) website URL to import." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(websiteUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "BareUnity bookings importer (+https://bareunity.com)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Website returned ${response.status}.` },
        { status: 502 },
      );
    }

    const html = await response.text();
    const pageText = stripTags(html);
    const jsonLdPlace = findJsonLdPlace(parseJsonLd(html));
    const name =
      stringValue(jsonLdPlace?.name) ||
      titleFromHtml(html) ||
      websiteUrl.hostname;
    const description = descriptionFromHtml(html);
    const address = addressFromJsonLd(jsonLdPlace);
    const geo = geoFromJsonLd(jsonLdPlace);
    const geocoded = geo
      ? null
      : await geocode(address || `${name}, ${websiteUrl.hostname}`);
    const coordinates = geo ?? geocoded;
    const amenities = uniqueStrings([
      ...config.defaultAmenities,
      ...extractAmenityCandidates(pageText, config.keywords),
    ]).slice(0, 10);
    const gallery = uniqueStrings([textFromMeta(html, "og:image")]).filter(
      Boolean,
    );
    const warnings = [];

    if (!coordinates) {
      warnings.push(
        "Coordinates could not be imported automatically. Add latitude and longitude before saving.",
      );
    }

    if (!address) {
      warnings.push(
        "No structured address was found. Review the location hint before saving.",
      );
    }

    const draft: ImportDraft = {
      name,
      shortDescription:
        description.slice(0, 160) || `${config.label} imported from website.`,
      fullDescription:
        description ||
        `${name} was imported from ${websiteUrl.hostname}. Review details before publishing this ${config.label.toLowerCase()} marker.`,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      locationHint: address || geocoded?.displayName || websiteUrl.hostname,
      accessType: "Public",
      terrain: config.terrain,
      safetyLevel: "Beginner friendly",
      website: websiteUrl.toString(),
      websiteUrl: websiteUrl.toString(),
      address: address || geocoded?.displayName || websiteUrl.hostname,
      country: "",
      placeName: address || geocoded?.displayName || websiteUrl.hostname,
      price: 1,
      rating: 4.5,
      badge: `Website-sourced ${config.label.toLowerCase()}`,
      vibe: `${config.label} listing`,
      checkInWindow: "Check the website for current availability",
      gallery,
      amenities,
      policies: [
        {
          category: "Booking policies",
          items: [
            "Review current availability, prices, cancellation terms, and guest requirements on the provider website before booking.",
          ],
        },
      ],
      tags: config.tags,
      reporterNotes: `Imported ${config.label.toLowerCase()} website: ${websiteUrl.toString()}`,
      warnings,
    };

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to import booking website", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import this website.",
      },
      { status: 500 },
    );
  }
}
