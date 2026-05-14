import { type NextRequest, NextResponse } from "next/server";

import { ensureStayAdmin } from "@/app/api/admin/stays/auth";

type ImportCategory = "activity";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ImportDraft = {
  slug: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  latitude?: number;
  longitude?: number;
  mapLatitude?: number;
  mapLongitude?: number;
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
  verification?: LocationVerification;
};

type GeocodeAddress = {
  road?: string;
  amenity?: string;
  attraction?: string;
  tourism?: string;
  leisure?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
};

type GeocodeResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  address?: GeocodeAddress;
};

type GeocodedLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
  address: string;
  country: string;
  placeName: string;
  provider?: string;
  accuracy?: string;
  placeId?: string;
  phone?: string;
  website?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  openingHours?: string[];
  types?: string[];
};

type LocationVerification = {
  confidenceScore: number;
  primaryProvider: string;
  crosscheckProvider?: string;
  distanceMeters?: number;
  googlePlaceId?: string;
  googleAccuracy?: string;
  mapboxAccuracy?: string;
  notes: string[];
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

function slugify(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

function stringValue(value: JsonValue | undefined): string {
  if (typeof value === "string") return decodeHtml(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value))
    return value
      .map((item) => stringValue(item))
      .filter(Boolean)
      .join(", ");

  const record = asRecord(value);
  if (record) {
    return (
      stringValue(record.name) ||
      stringValue(record.url) ||
      stringValue(record["@id"])
    );
  }

  return "";
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
      type.includes("beautysalon") ||
      type.includes("sportsactivitylocation") ||
      type.includes("event") ||
      type.includes("place") ||
      type.includes("touristattraction")
    ) {
      return record;
    }
  }

  return null;
}

function flattenJsonLd(records: JsonValue[]) {
  const flattened: Record<string, JsonValue>[] = [];
  const queue = [...records];

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    flattened.push(record);
    const graph = record["@graph"];
    if (Array.isArray(graph)) queue.push(...graph);
  }

  return flattened;
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
  const geo = asRecord(record?.geo) ?? asRecord(record?.location);
  if (!geo) return null;

  const latitude = Number(stringValue(geo.latitude));
  const longitude = Number(stringValue(geo.longitude));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function extractAmenityCandidates(text: string, keywords: string[]) {
  const lowerText = text.toLowerCase();
  return keywords
    .filter((keyword) => lowerText.includes(keyword))
    .map((keyword) => `${keyword.charAt(0).toUpperCase()}${keyword.slice(1)}`);
}

function firstNonEmpty(...values: string[]) {
  return values.map((value) => decodeHtml(value).trim()).find(Boolean) ?? "";
}

function absolutizeUrl(value: string, baseUrl: URL) {
  const cleaned = decodeHtml(value).trim();
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:"))
    return "";

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return "";
  }
}

function imageValue(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => imageValue(item));

  const record = asRecord(value);
  if (!record) return [];

  return [
    stringValue(record.url),
    stringValue(record.contentUrl),
    stringValue(record.thumbnailUrl),
  ].filter(Boolean);
}

function srcsetUrls(value: string) {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

function collectGallery(
  html: string,
  records: Record<string, JsonValue>[],
  websiteUrl: URL,
) {
  const candidates = [
    textFromMeta(html, "og:image"),
    textFromMeta(html, "og:image:secure_url"),
    textFromMeta(html, "twitter:image"),
    ...records.flatMap((record) => [
      ...imageValue(record.image),
      ...imageValue(record.photo),
      ...imageValue(record.logo),
    ]),
    ...[
      ...html.matchAll(
        /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
      ),
    ].map((match) => match[1] ?? ""),
    ...[
      ...html.matchAll(
        /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi,
      ),
    ].map((match) => match[1] ?? ""),
    ...[
      ...html.matchAll(/<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi),
    ].flatMap((match) => srcsetUrls(match[1] ?? "")),
    ...[...html.matchAll(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi)].flatMap(
      (match) => srcsetUrls(match[1] ?? ""),
    ),
  ];

  return uniqueStrings(
    candidates
      .map((candidate) => absolutizeUrl(candidate, websiteUrl))
      .filter(
        (candidate) =>
          /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(candidate) ||
          /(?:image|media|uploads|wp-content|cdn|assets)/i.test(candidate),
      ),
  ).slice(0, 8);
}

function collectInternalLinks(html: string, rootUrl: URL) {
  const linkKeywords =
    /contact|location|locatie|route|about|over|wellness|sauna|massage|facilit|praktisch|visit|bezoek/i;
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)]
    .map((match) => match[1] ?? "")
    .map((href) => {
      try {
        return new URL(href, rootUrl);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => url.origin === rootUrl.origin)
    .filter(
      (url) =>
        linkKeywords.test(url.pathname) || linkKeywords.test(url.toString()),
    );

  return uniqueStrings(links.map((url) => url.toString())).slice(0, 5);
}

type CrawledPage = {
  url: URL;
  html: string;
  text: string;
};

async function fetchHtml(url: URL) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "BareUnity bookings importer (+https://bareunity.com)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType))
    return null;

  return response.text();
}

async function crawlBookingWebsite(rootUrl: URL) {
  const rootHtml = await fetchHtml(rootUrl);
  if (!rootHtml) return [];

  const pages: CrawledPage[] = [
    { url: rootUrl, html: rootHtml, text: stripTags(rootHtml) },
  ];

  for (const link of collectInternalLinks(rootHtml, rootUrl)) {
    if (pages.length >= 4) break;
    const pageUrl = new URL(link);
    const html = await fetchHtml(pageUrl);
    if (!html) continue;
    pages.push({ url: pageUrl, html, text: stripTags(html) });
  }

  return pages;
}

function addressCountryFromJsonLd(record: Record<string, JsonValue> | null) {
  const address = record?.address;
  const addressRecord = asRecord(address);
  if (!addressRecord) return "";

  return stringValue(addressRecord.addressCountry);
}

function addressPlaceFromJsonLd(record: Record<string, JsonValue> | null) {
  const address = record?.address;
  const addressRecord = asRecord(address);
  if (!addressRecord) return "";

  return firstNonEmpty(
    stringValue(addressRecord.addressLocality),
    stringValue(addressRecord.addressRegion),
  );
}

function geocodeAddressLine(result: GeocodeResult, fallback: string) {
  const address = result.address;
  if (!address) return result.display_name ?? fallback;

  const street = uniqueStrings([
    address.road ?? "",
    address.house_number ?? "",
  ]).join(" ");

  return (
    uniqueStrings([
      street,
      address.postcode ?? "",
      address.city ?? address.town ?? address.village ?? "",
      address.state ?? address.region ?? "",
      address.country ?? "",
    ]).join(", ") ||
    result.display_name ||
    fallback
  );
}

function geocodePlaceName(result: GeocodeResult, fallback: string) {
  const address = result.address;
  return (
    address?.city ||
    address?.town ||
    address?.village ||
    address?.municipality ||
    address?.county ||
    address?.state ||
    address?.region ||
    result.name ||
    fallback
  );
}


function coordinateDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLng = toRadians(second.longitude - first.longitude);
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

function googleApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    ""
  ).trim();
}

function mapboxAccessToken() {
  return (
    process.env.MAPBOX_ACCESS_TOKEN ||
    ""
  ).trim();
}

function confidenceFromDistance(distanceMeters: number | undefined) {
  if (typeof distanceMeters !== "number") return 72;
  if (distanceMeters <= 50) return 96;
  if (distanceMeters <= 150) return 88;
  if (distanceMeters <= 500) return 68;
  return 42;
}

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  types?: string[];
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
};

type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{
    place_id?: string;
    formatted_address?: string;
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
    address_components?: Array<{
      long_name?: string;
      types?: string[];
    }>;
  }>;
};

type MapboxGeocodeResponse = {
  features?: Array<{
    id?: string;
    place_name?: string;
    text?: string;
    center?: [number, number];
    properties?: { accuracy?: string; mapbox_id?: string };
    coordinates?: { longitude?: number; latitude?: number; accuracy?: string };
  }>;
};


function geocodedLocationFromGooglePlace(
  place: GooglePlace | undefined,
  query: string,
): GeocodedLocation | null {
  const latitude = place?.location?.latitude;
  const longitude = place?.location?.longitude;
  if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    displayName: place.formattedAddress || place.displayName?.text || query,
    address: place.formattedAddress || query,
    country: "",
    placeName: place.displayName?.text || query,
    provider: "google_places",
    accuracy: "place",
    placeId: place.id,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    businessStatus: place.businessStatus,
    googleMapsUri: place.googleMapsUri,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
    types: place.types,
  };
}

async function googlePlaceDetails(
  placeId: string | undefined,
  query: string,
): Promise<GeocodedLocation | null> {
  const key = googleApiKey();
  if (!key || !placeId) return null;

  const response = await fetch(`https://places.googleapis.com/v1/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,websiteUri,nationalPhoneNumber,internationalPhoneNumber,rating,userRatingCount,businessStatus,googleMapsUri,regularOpeningHours.weekdayDescriptions,types",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const place = (await response.json()) as GooglePlace;
  return geocodedLocationFromGooglePlace(place, query);
}

async function googlePlacesSearch(
  query: string,
  websiteUrl: URL,
): Promise<GeocodedLocation | null> {
  const key = googleApiKey();
  if (!key || !query) return null;

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.types",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as GooglePlacesResponse;
  const host = websiteUrl.hostname.replace(/^www\./i, "").toLowerCase();
  const places = payload.places ?? [];
  const place =
    places.find((candidate) => {
      if (!candidate.websiteUri) return false;
      try {
        return new URL(candidate.websiteUri).hostname
          .replace(/^www\./i, "")
          .toLowerCase()
          .includes(host);
      } catch {
        return false;
      }
    }) ?? places[0];

  if (!place) return null;

  return (
    (await googlePlaceDetails(place.id, query)) ??
    geocodedLocationFromGooglePlace(place, query)
  );
}

function countryFromGoogleResult(
  components:
    | Array<{ long_name?: string; types?: string[] }>
    | undefined,
) {
  if (!Array.isArray(components)) return "";
  return (
    components.find((component) => component.types?.includes("country"))
      ?.long_name ?? ""
  );
}

async function googleGeocode(query: string): Promise<GeocodedLocation | null> {
  const key = googleApiKey();
  if (!key || !query) return null;

  const params = new URLSearchParams({ address: query, key });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as GoogleGeocodeResponse;
  const result = payload.results?.[0];
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    displayName: result.formatted_address || query,
    address: result.formatted_address || query,
    country: countryFromGoogleResult(result.address_components),
    placeName: result.formatted_address || query,
    provider: "google_geocoding",
    accuracy: result.geometry?.location_type,
    placeId: result.place_id,
  };
}

async function mapboxGeocode(query: string): Promise<GeocodedLocation | null> {
  const token = mapboxAccessToken();
  if (!token || !query) return null;

  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
    types: "poi,address,place,locality",
  });
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query,
    )}.json?${params.toString()}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as MapboxGeocodeResponse;
  const feature = payload.features?.[0];
  const longitude = feature?.coordinates?.longitude ?? feature?.center?.[0];
  const latitude = feature?.coordinates?.latitude ?? feature?.center?.[1];
  if (!feature || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    displayName: feature.place_name || query,
    address: feature.place_name || query,
    country: "",
    placeName: feature.text || feature.place_name || query,
    provider: "mapbox",
    accuracy: feature.coordinates?.accuracy || feature.properties?.accuracy,
    placeId: feature.properties?.mapbox_id || feature.id,
  };
}

async function geocode(query: string): Promise<GeocodedLocation | null> {
  if (!query) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&q=${encodeURIComponent(query)}`,
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
    for (const result of results) {
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const displayName = result.display_name ?? query;
      return {
        latitude,
        longitude,
        displayName,
        address: geocodeAddressLine(result, displayName),
        country: result.address?.country ?? "",
        placeName: geocodePlaceName(result, displayName),
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueGeocodeQueries(values: string[]) {
  const seen = new Set<string>();

  return values
    .map((value) => decodeHtml(value).trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function hostnameSearchTerms(hostname: string) {
  const withoutWww = hostname.replace(/^www\./i, "");
  const labels = withoutWww.split(".").filter(Boolean);
  const brandLabel = labels[0]?.replace(/[-_]+/g, " ") ?? "";

  return uniqueGeocodeQueries([withoutWww, brandLabel]);
}


async function safeLocationResult(
  resolver: () => Promise<GeocodedLocation | null>,
  notes: string[],
  failureNote: string,
) {
  try {
    return await resolver();
  } catch {
    if (!notes.includes(failureNote)) notes.push(failureNote);
    return null;
  }
}

async function geocodeImportedLocation(
  name: string,
  address: string,
  websiteUrl: URL,
): Promise<{ location: GeocodedLocation | null; verification: LocationVerification }> {
  const hostTerms = hostnameSearchTerms(websiteUrl.hostname);
  const queries = uniqueGeocodeQueries([
    uniqueStrings([name, address]).join(", "),
    address,
    ...hostTerms.map((term) => `${name}, ${term}`),
    name,
    ...hostTerms,
  ]);
  const notes: string[] = [];

  let primary: GeocodedLocation | null = null;
  for (const query of queries) {
    primary = await safeLocationResult(
      () => googlePlacesSearch(query, websiteUrl),
      notes,
      "Google Places details failed or timed out; trying Google Geocoding next.",
    );
    if (primary) {
      notes.push("Google Places matched the crawled stay/place and returned rich place details.");
      break;
    }
  }

  if (!primary) {
    for (const query of queries) {
      primary = await safeLocationResult(
        () => googleGeocode(query),
        notes,
        "Google Geocoding failed or timed out; trying Mapbox next.",
      );
      if (primary) {
        notes.push("Google Geocoding resolved the crawled address/location candidate.");
        break;
      }
    }
  }

  let crosscheck: GeocodedLocation | null = null;
  for (const query of uniqueGeocodeQueries([primary?.address ?? "", ...queries])) {
    crosscheck = await safeLocationResult(
      () => mapboxGeocode(query),
      notes,
      "Mapbox cross-check failed or timed out; review the primary coordinate manually.",
    );
    if (crosscheck) {
      notes.push("Mapbox returned a coordinate cross-check for the same candidate.");
      break;
    }
  }

  if (!primary && crosscheck) {
    notes.push("Mapbox is being used as the primary source because Google did not return a match.");
    primary = crosscheck;
    crosscheck = null;
  }

  if (!primary) {
    for (const query of queries) {
      primary = await geocode(query);
      if (primary) {
        notes.push("OpenStreetMap/Nominatim fallback resolved the candidate after Google and Mapbox returned no match.");
        break;
      }
    }
  }

  const distanceMeters =
    primary && crosscheck && primary.provider !== crosscheck.provider
      ? coordinateDistanceMeters(primary, crosscheck)
      : undefined;
  if (typeof distanceMeters === "number") {
    if (distanceMeters <= 50) {
      notes.push("Google and Mapbox coordinates agree within 50 meters.");
    } else if (distanceMeters <= 150) {
      notes.push("Google and Mapbox coordinates are close, but review the map preview before publishing.");
    } else {
      notes.push("Google and Mapbox coordinates differ enough to require manual review.");
    }
  }

  if (!googleApiKey()) {
    notes.push("Set GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY to enable rich Google stay/place details.");
  }
  if (!mapboxAccessToken()) {
    notes.push("Set MAPBOX_ACCESS_TOKEN to enable server-side Mapbox coordinate cross-checks.");
  }

  const googleResult = [primary, crosscheck].find((result) =>
    result?.provider?.startsWith("google"),
  );
  const mapboxResult = [primary, crosscheck].find(
    (result) => result?.provider === "mapbox",
  );

  return {
    location: primary,
    verification: {
      confidenceScore: primary ? confidenceFromDistance(distanceMeters) : 0,
      primaryProvider: primary?.provider ?? "none",
      crosscheckProvider: crosscheck?.provider,
      distanceMeters,
      googlePlaceId: googleResult?.placeId,
      googleAccuracy: googleResult?.accuracy,
      mapboxAccuracy: mapboxResult?.accuracy,
      notes,
    },
  };
}

export async function GET(request: NextRequest) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  const category: ImportCategory = "activity";
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
    const crawledPages = await crawlBookingWebsite(websiteUrl);
    if (!crawledPages.length) {
      return NextResponse.json(
        { error: "No crawlable website pages were found." },
        { status: 502 },
      );
    }

    const html = crawledPages.map((page) => page.html).join("\n\n");
    const pageText = crawledPages
      .map((page) => `URL: ${page.url.toString()}\n${page.text}`)
      .join("\n\n");
    const records = crawledPages.flatMap((page) => parseJsonLd(page.html));
    const jsonLdPlace = findJsonLdPlace(records);
    const name =
      stringValue(jsonLdPlace?.name) ||
      titleFromHtml(html) ||
      websiteUrl.hostname;
    const description = descriptionFromHtml(html);
    const address = addressFromJsonLd(jsonLdPlace);
    const jsonLdCountry = addressCountryFromJsonLd(jsonLdPlace);
    const jsonLdPlaceName = addressPlaceFromJsonLd(jsonLdPlace);
    const geo = geoFromJsonLd(jsonLdPlace);
    const { location: geocoded, verification } = await geocodeImportedLocation(
      name,
      address,
      websiteUrl,
    );
    const coordinates = geo ?? geocoded;
    if (geo) {
      verification.notes.unshift(
        "Structured JSON-LD coordinates were found on the crawled website and used as the initial marker coordinate.",
      );
      verification.primaryProvider = "website_json_ld";
      verification.confidenceScore = Math.max(verification.confidenceScore, 82);
    }
    const amenities = uniqueStrings([
      ...config.defaultAmenities,
      ...extractAmenityCandidates(pageText, config.keywords),
    ]).slice(0, 10);
    const gallery = collectGallery(html, flattenJsonLd(records), websiteUrl);
    const warnings = [
      `Checked ${crawledPages.length} website page${crawledPages.length === 1 ? "" : "s"} for ${config.label.toLowerCase()} details, location, amenities, policies, and images.`,
    ];

    if (!coordinates) {
      warnings.push(
        "Coordinates could not be imported automatically. Add latitude/longitude manually before saving.",
      );
    } else if (verification.confidenceScore < 75) {
      warnings.push(
        "Coordinate confidence is below the one-click approval threshold. Compare Google, Mapbox, and the map preview before saving.",
      );
    }

    if (!address && !geocoded?.address) {
      warnings.push(
        "No structured address was found. Review the location hint before saving.",
      );
    }

    if (!gallery.length) {
      warnings.push(
        "No gallery images were detected. Add public image URLs from the website manually if available.",
      );
    }

    const draft: ImportDraft = {
      slug: slugify(
        `${name}-${geocoded?.placeName || jsonLdPlaceName || geocoded?.country || jsonLdCountry || websiteUrl.hostname}`,
      ),
      name,
      shortDescription:
        description.slice(0, 160) || `${config.label} imported from website.`,
      fullDescription:
        description ||
        `${name} was imported from ${websiteUrl.hostname}. Review details before publishing this ${config.label.toLowerCase()} marker.`,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      mapLatitude: coordinates?.latitude,
      mapLongitude: coordinates?.longitude,
      locationHint:
        address ||
        geocoded?.address ||
        geocoded?.displayName ||
        websiteUrl.hostname,
      accessType: "Public",
      terrain: config.terrain,
      safetyLevel: "Beginner friendly",
      website: geocoded?.website || websiteUrl.toString(),
      websiteUrl: geocoded?.website || websiteUrl.toString(),
      address:
        address ||
        geocoded?.address ||
        geocoded?.displayName ||
        websiteUrl.hostname,
      country: geocoded?.country || jsonLdCountry || "",
      placeName:
        geocoded?.placeName ||
        jsonLdPlaceName ||
        address ||
        websiteUrl.hostname,
      price: 1,
      rating: typeof geocoded?.rating === "number" ? geocoded.rating : 4.5,
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
      reporterNotes: [
        `Imported ${config.label.toLowerCase()} website: ${websiteUrl.toString()}`,
        `Verification: ${verification.primaryProvider} confidence ${verification.confidenceScore}/100`,
        typeof verification.distanceMeters === "number"
          ? `Google/Mapbox distance: ${verification.distanceMeters}m`
          : "Google/Mapbox distance: unavailable",
        geocoded?.phone ? `Google phone: ${geocoded.phone}` : "",
        geocoded?.googleMapsUri ? `Google Maps: ${geocoded.googleMapsUri}` : "",
        typeof geocoded?.rating === "number"
          ? `Google rating: ${geocoded.rating}${geocoded.userRatingCount ? ` (${geocoded.userRatingCount} reviews)` : ""}`
          : "",
        geocoded?.businessStatus ? `Business status: ${geocoded.businessStatus}` : "",
        geocoded?.openingHours?.length
          ? `Opening hours: ${geocoded.openingHours.join("; ")}`
          : "",
        ...verification.notes.map((note) => `- ${note}`),
      ]
        .filter(Boolean)
        .join("\n"),
      warnings,
      verification,
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
