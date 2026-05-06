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

type CrawledResource = {
  url: string;
  kind: "html" | "pdf" | "text";
  html: string;
  text: string;
};

const IS_VERCEL = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
const DEFAULT_OLLAMA_API_BASE_URL = IS_VERCEL ? "https://ollama.com/api" : "http://localhost:11434/api";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_API_BASE_URL = (process.env.OLLAMA_API_BASE_URL ?? DEFAULT_OLLAMA_API_BASE_URL).replace(/\/$/, "");
const OLLAMA_STAYS_MODEL = process.env.OLLAMA_STAYS_MODEL ?? "gpt-oss:120b";
const OLLAMA_REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? 45000);
const MAX_AI_HTML_CHARACTERS = 100000;
const MAX_IMPORT_CRAWL_PAGES = Math.max(1, Number(process.env.STAYS_IMPORT_MAX_CRAWL_PAGES ?? 12));
const MAX_IMPORT_DOCUMENTS = Math.max(0, Number(process.env.STAYS_IMPORT_MAX_DOCUMENTS ?? 6));
const MAX_CRAWLED_CONTENT_CHARACTERS = 300000;

function isListingType(value: string): value is Listing["type"] {
  return ["Hotel", "Entire place", "Boutique stay", "Naturist camping"].includes(value);
}

function coerceString(value: JsonValue | undefined) {
  return typeof value === "string" ? decodeHtml(value) : "";
}

function coerceStringArray(value: JsonValue | undefined) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => (typeof item === "string" ? decodeHtml(item) : ""))).slice(0, 40);
}

function coercePolicies(value: JsonValue | undefined) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        category: coerceString(record?.category),
        items: coerceStringArray(record?.items),
      };
    })
    .filter((policy) => policy.category && policy.items.length)
    .slice(0, 12);
}

function readOllamaContent(value: JsonValue) {
  const root = asRecord(value);
  const message = asRecord(root?.message);
  return coerceString(message?.content);
}

function isLocalOllamaUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isHostedOllamaUrl(value: string) {
  try {
    return new URL(value).hostname === "ollama.com";
  } catch {
    return false;
  }
}

function parseAiJson(content: string) {
  const cleaned = content
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, JsonValue>;
  } catch {
    return null;
  }
}

function sanitizeAiDraft(value: Record<string, JsonValue>, websiteUrl: URL): Partial<ImportDraft> {
  const type = coerceString(value.type);
  const rating = firstNumber(value.rating);
  const price = firstNumber(value.price);
  const policies = coercePolicies(value.policies);
  const name = coerceString(value.name);
  const country = coerceString(value.country);
  const placeName = coerceString(value.placeName);
  const amenities = coerceStringArray(value.amenities);
  const checkInWindow = coerceString(value.checkInWindow);

  return {
    slug: slugify(coerceString(value.slug) || `${name}-${placeName || country || websiteUrl.hostname}`),
    name,
    country,
    placeName,
    type: isListingType(type) ? type : undefined,
    rating: rating !== null && Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : undefined,
    price: price !== null && Number.isFinite(price) && price > 0 ? price : undefined,
    badge: coerceString(value.badge),
    vibe: coerceString(value.vibe),
    amenities,
    description: coerceString(value.description),
    websiteUrl: websiteUrl.toString(),
    address: coerceString(value.address),
    checkInWindow,
    policies,
    gallery: coerceStringArray(value.gallery).map((image) => absolutizeUrl(image, websiteUrl)).filter(Boolean).slice(0, 8),
  };
}

function mergePolicyDrafts(basePolicies: PolicyDraft[], aiPolicies: PolicyDraft[] | undefined) {
  const byCategory = new Map<string, PolicyDraft>();

  for (const policy of [...basePolicies, ...(aiPolicies ?? [])]) {
    const category = policy.category.trim();
    if (!category || !policy.items.length) continue;
    const key = category.toLowerCase();
    const existing = byCategory.get(key);
    byCategory.set(key, {
      category: existing?.category ?? category,
      items: uniqueStrings([...(existing?.items ?? []), ...policy.items]).slice(0, 8),
    });
  }

  return [...byCategory.values()].slice(0, 12);
}

function mergeAiDraft(baseDraft: ImportDraft, aiDraft: Partial<ImportDraft>): ImportDraft {
  const amenities = uniqueStrings([...(baseDraft.amenities ?? []), ...(aiDraft.amenities ?? [])]).slice(0, 40);

  return {
    ...baseDraft,
    slug: aiDraft.slug || baseDraft.slug,
    name: aiDraft.name || baseDraft.name,
    country: aiDraft.country || baseDraft.country,
    placeName: aiDraft.placeName || baseDraft.placeName,
    type: aiDraft.type || baseDraft.type,
    rating: aiDraft.rating ?? baseDraft.rating,
    price: aiDraft.price ?? baseDraft.price,
    badge: aiDraft.badge || baseDraft.badge,
    vibe: aiDraft.vibe || baseDraft.vibe,
    amenities: amenities.length ? amenities : baseDraft.amenities,
    description: aiDraft.description || baseDraft.description,
    websiteUrl: aiDraft.websiteUrl || baseDraft.websiteUrl,
    address: aiDraft.address || baseDraft.address,
    checkInWindow: aiDraft.checkInWindow || baseDraft.checkInWindow,
    policies: mergePolicyDrafts(baseDraft.policies, aiDraft.policies),
    gallery: aiDraft.gallery?.length ? aiDraft.gallery : baseDraft.gallery,
    warnings: baseDraft.warnings,
  };
}

async function enrichDraftWithAi(baseDraft: ImportDraft, crawledContent: string, websiteUrl: URL) {
  if (IS_VERCEL && isLocalOllamaUrl(OLLAMA_API_BASE_URL)) {
    baseDraft.warnings.push("Ollama enrichment skipped. Vercel cannot reach a localhost Ollama server; set OLLAMA_API_BASE_URL=https://ollama.com/api and OLLAMA_API_KEY in Vercel environment variables.");
    return baseDraft;
  }

  if (isHostedOllamaUrl(OLLAMA_API_BASE_URL) && !OLLAMA_API_KEY) {
    baseDraft.warnings.push("Ollama enrichment skipped. Direct ollama.com API access requires OLLAMA_API_KEY; add it in Vercel environment variables.");
    return baseDraft;
  }

  const prompt = `Extract a BareUnity stay listing from this public accommodation website crawl. Use only facts present in the crawled HTML/text/PDF content. Do a thorough check of services, facilities, amenities, activities, entertainment, house rules, booking terms, cancellation, payment, pets, naturist rules, check-in/out, privacy/terms, FAQ, and downloadable PDF/document content. Return strict JSON with these keys: slug, name, country, placeName, type, rating, price, badge, vibe, amenities, description, websiteUrl, address, checkInWindow, policies, gallery. type must be one of Hotel, Entire place, Boutique stay, Naturist camping. amenities should include Services and/or Entertainment when the website mentions entertainment and/or services, recreation, events, shows, music, games, animation, or activity programmes. policies must be an array of {"category":"...","items":["..."]} based on visible website/document policy text, not generic assumptions. gallery must contain public image URLs only. If a fact is missing, use an empty string, null, or empty array.

URL: ${websiteUrl.toString()}

Existing parser draft:
${JSON.stringify(baseDraft)}

Crawled website and document content excerpt:
${crawledContent.slice(0, MAX_AI_HTML_CHARACTERS)}`;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (OLLAMA_API_KEY) headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;

    const response = await fetch(`${OLLAMA_API_BASE_URL}/chat`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(Number.isFinite(OLLAMA_REQUEST_TIMEOUT_MS) ? OLLAMA_REQUEST_TIMEOUT_MS : 45000),
      body: JSON.stringify({
        model: OLLAMA_STAYS_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          {
            role: "system",
            content: "You are a careful travel data extraction assistant. Never invent missing details. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      baseDraft.warnings.push(`Ollama enrichment failed: provider returned ${response.status}. Parser data was kept.`);
      return baseDraft;
    }

    const payload = (await response.json()) as JsonValue;
    const content = readOllamaContent(payload);
    const parsed = parseAiJson(content);
    if (!parsed) {
      baseDraft.warnings.push("Ollama enrichment returned an unreadable response. Parser data was kept.");
      return baseDraft;
    }

    const enrichedDraft = mergeAiDraft(baseDraft, sanitizeAiDraft(parsed, websiteUrl));
    enrichedDraft.warnings.push(`Ollama enrichment applied with ${OLLAMA_STAYS_MODEL}. Review all fields before saving.`);
    return enrichedDraft;
  } catch (error) {
    baseDraft.warnings.push(`Ollama enrichment failed: ${error instanceof Error ? error.message : "unknown provider error"}. Parser data was kept. On Vercel, set OLLAMA_API_BASE_URL=https://ollama.com/api plus OLLAMA_API_KEY; locally, make sure Ollama is running and the ${OLLAMA_STAYS_MODEL} model is pulled.`);
    return baseDraft;
  }
}

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

function normalizeCrawlUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isSameOriginCrawlUrl(url: URL, rootUrl: URL) {
  return url.origin === rootUrl.origin && ["http:", "https:"].includes(url.protocol);
}

function isHtmlLikeUrl(url: URL) {
  return !/\.(?:7z|avi|css|csv|docx?|gif|ico|jpe?g|js|json|mov|mp3|mp4|png|pptx?|rar|svg|webm|webp|xlsx?|xml|zip)$/i.test(url.pathname);
}

function isDocumentUrl(url: URL) {
  return /\.(?:pdf|txt|text)$/i.test(url.pathname);
}

function scoreCrawlUrl(url: URL) {
  const value = `${url.pathname} ${url.search}`.toLowerCase();
  const priorityTerms = [
    "policy",
    "policies",
    "terms",
    "conditions",
    "rules",
    "house-rules",
    "faq",
    "cancellation",
    "cancel",
    "payment",
    "reservation",
    "booking",
    "arrival",
    "check-in",
    "checkout",
    "privacy",
    "amenit",
    "facilit",
    "service",
    "restaurant",
    "wellness",
    "spa",
    "pool",
    "beach",
    "activities",
    "activity",
    "recreation",
    "entertainment",
    "animation",
    "things-to-do",
    "experience",
    "accommodation",
    "rooms",
    "rates",
    "contact",
    "location",
  ];
  return priorityTerms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
}

function collectInternalLinks(html: string, pageUrl: URL, rootUrl: URL) {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeCrawlUrl(match[1] ?? "", pageUrl))
    .filter((url): url is URL => url !== null && isSameOriginCrawlUrl(url, rootUrl) && (isHtmlLikeUrl(url) || isDocumentUrl(url)));

  return uniqueStrings(links.map((url) => url.toString()))
    .map((href) => new URL(href))
    .sort((a, b) => scoreCrawlUrl(b) - scoreCrawlUrl(a));
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, escaped: string) => {
      const replacements: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      return replacements[escaped] ?? escaped;
    })
    .replace(/\\\d{1,3}/g, " ");
}

function textFromPdfBuffer(buffer: ArrayBuffer) {
  const binary = Buffer.from(buffer).toString("latin1");
  const literalStrings = [...binary.matchAll(/\((?:\\.|[^\\)]){3,}\)/g)].map((match) => decodePdfLiteral(match[0].slice(1, -1)));
  const hexStrings = [...binary.matchAll(/<([0-9a-fA-F]{8,})>/g)]
    .map((match) => Buffer.from(match[1] ?? "", "hex").toString("utf8"))
    .filter(Boolean);

  return decodeHtml([...literalStrings, ...hexStrings].join(" ").replace(/[\u0000-\u001f]+/g, " "));
}

async function fetchCrawlResource(url: URL): Promise<CrawledResource> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "BareUnity stay listing importer (+https://bareunity.com)",
      Accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5",
    },
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`Website returned ${response.status}.`);

  const contentType = response.headers.get("content-type") ?? "";
  const isPdf = /application\/pdf/i.test(contentType) || /\.pdf$/i.test(url.pathname);
  const isText = /text\/plain/i.test(contentType) || /\.(?:txt|text)$/i.test(url.pathname);

  if (isPdf) {
    const text = textFromPdfBuffer(await response.arrayBuffer());
    return { url: url.toString(), kind: "pdf", html: "", text };
  }

  if (isText) {
    const text = decodeHtml(await response.text());
    return { url: url.toString(), kind: "text", html: "", text };
  }

  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`Website returned ${contentType || "a non-readable response"}.`);
  }

  const html = await response.text();
  return { url: url.toString(), kind: "html", html, text: textFromHtml(html) };
}

async function crawlStayWebsite(rootUrl: URL) {
  const resources: CrawledResource[] = [];
  const visited = new Set<string>();
  const queue: URL[] = [rootUrl];
  const htmlLimit = Number.isFinite(MAX_IMPORT_CRAWL_PAGES) ? MAX_IMPORT_CRAWL_PAGES : 12;
  const documentLimit = Number.isFinite(MAX_IMPORT_DOCUMENTS) ? MAX_IMPORT_DOCUMENTS : 6;
  let htmlCount = 0;
  let documentCount = 0;

  while (queue.length && (htmlCount < htmlLimit || documentCount < documentLimit)) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;

    const normalized = normalizeCrawlUrl(pageUrl.toString(), rootUrl);
    if (!normalized) continue;
    const href = normalized.toString();
    if (visited.has(href) || !isSameOriginCrawlUrl(normalized, rootUrl)) continue;

    const wantsDocument = isDocumentUrl(normalized);
    if (wantsDocument && documentCount >= documentLimit) continue;
    if (!wantsDocument && htmlCount >= htmlLimit) continue;

    visited.add(href);

    try {
      const resource = await fetchCrawlResource(normalized);
      resources.push(resource);

      if (resource.kind === "html") {
        htmlCount += 1;
        const links = collectInternalLinks(resource.html, normalized, rootUrl).filter((link) => !visited.has(link.toString()));
        queue.push(...links.slice(0, 24));
        queue.sort((a, b) => scoreCrawlUrl(b) - scoreCrawlUrl(a));
      } else {
        documentCount += 1;
      }
    } catch (error) {
      if (!resources.length) throw error;
    }
  }

  return resources;
}

function combineCrawledContent(resources: CrawledResource[]) {
  return resources
    .map((resource) => `URL: ${resource.url}\nTYPE: ${resource.kind.toUpperCase()}\nCONTENT:\n${resource.kind === "html" ? `${resource.text}\n\nHTML:\n${resource.html}` : resource.text}`)
    .join("\n\n--- Crawled resource ---\n\n")
    .slice(0, MAX_CRAWLED_CONTENT_CHARACTERS);
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
  const highlights = amenities.filter((amenity) => /pool|sauna|spa|beach|restaurant|bar|garden|terrace|cycling|playground|parking|entertainment|activities/i.test(amenity)).slice(0, 3);
  return uniqueStrings([type, placeName, ...highlights]).join(" · ") || "Website-sourced listing";
}

function collectPolicyItems(text: string, matcher: RegExp) {
  const items: string[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 240);

  for (const sentence of sentences) {
    if (matcher.test(sentence)) items.push(sentence.replace(/^[•\-*\d.)\s]+/, ""));
  }

  return uniqueStrings(items).slice(0, 6);
}

function extractPoliciesFromText(text: string, checkInWindow: string, type: Listing["type"]): PolicyDraft[] {
  const policyMatchers: Array<[string, RegExp]> = [
    ["Check-in and check-out", /\b(?:check[- ]?in|check[- ]?out|arrival|departure|reception hours|late arrival)\b/i],
    ["Cancellation", /\b(?:cancell?ation|cancel|refund|non[- ]?refundable|deposit|no[- ]?show)\b/i],
    ["Accepted payment methods", /\b(?:payment|pay|credit card|visa|mastercard|cash|bank transfer|deposit|prepayment)\b/i],
    ["House rules", /\b(?:house rules|site rules|rules|quiet hours|noise|respect|behaviour|behavior)\b/i],
    ["Pets", /\b(?:pet|pets|dog|dogs|animal|animals)\b/i],
    ["Naturist rules", /\b(?:naturist|nudist|clothing optional|clothes free|textile|etiquette)\b/i],
    ["Children and families", /\b(?:children|child|kids|family|families|adult only|adults only)\b/i],
    ["Accessibility", /\b(?:accessible|accessibility|wheelchair|disabled|mobility)\b/i],
    ["Security", /\b(?:security|safe|safety|emergency|liability|belongings|responsibility)\b/i],
  ];

  const extracted = policyMatchers
    .map(([category, matcher]) => ({ category, items: collectPolicyItems(text, matcher) }))
    .filter((policy) => policy.items.length);

  return mergePolicyDrafts(extracted, buildFallbackPolicies(checkInWindow, type));
}

function buildFallbackPolicies(checkInWindow: string, type: Listing["type"]): PolicyDraft[] {
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
  const amenityMatchers: Array<[string, RegExp]> = [
    ["WiFi", /\b(?:wi[- ]?fi|wireless internet)\b/i],
    ["Pool", /\b(?:pool|swimming pool|piscine|zwembad)\b/i],
    ["Sauna", /\bsauna\b/i],
    ["Restaurant", /\b(?:restaurant|dining|brasserie|bistro)\b/i],
    ["Bar", /\b(?:bar|lounge|pub)\b/i],
    ["Parking", /\b(?:parking|car park|garage)\b/i],
    ["Breakfast", /\bbreakfast\b/i],
    ["Spa", /\b(?:spa|wellness|massage|treatment)\b/i],
    ["Beach", /\b(?:beach|strand|seaside|coast)\b/i],
    ["Terrace", /\b(?:terrace|patio|sun deck)\b/i],
    ["Garden", /\b(?:garden|grounds|parkland)\b/i],
    ["Laundry", /\b(?:laundry|washing machine|launderette)\b/i],
    ["Air conditioning", /\b(?:air conditioning|air-conditioning|a\/c|climate control)\b/i],
    ["Pets allowed", /\b(?:pets allowed|pet friendly|dogs allowed|dog friendly)\b/i],
    ["Playground", /\b(?:playground|children.?s play|kids play)\b/i],
    ["Bicycle rental", /\b(?:bicycle rental|bike rental|cycle hire|fietsverhuur)\b/i],
    [
      "Entertainment",
      /\b(?:entertainment|recreation|animation team|evening show|live music|music night|karaoke|cinema|game room|games room|arcade|clubhouse|events programme|activities programme)\b/i,
    ],
    ["Activities", /\b(?:activities|things to do|excursions|sports|yoga|fitness|tennis|volleyball|watersports)\b/i],
  ];

  for (const [amenity, matcher] of amenityMatchers) {
    if (matcher.test(text)) amenities.add(amenity);
  }

  return [...amenities].slice(0, 40);
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
    const crawledResources = await crawlStayWebsite(websiteUrl);
    if (!crawledResources.length) return NextResponse.json({ error: "No crawlable website pages or documents were found." }, { status: 502 });

    const htmlResources = crawledResources.filter((resource) => resource.kind === "html");
    const documentResources = crawledResources.filter((resource) => resource.kind !== "html");
    const html = htmlResources.map((resource) => resource.html).join("\n\n");
    const htmlText = crawledResources.map((resource) => `URL: ${resource.url}\nTYPE: ${resource.kind.toUpperCase()}\n${resource.text}`).join("\n\n");
    const crawledContent = combineCrawledContent(crawledResources);
    const jsonLd = htmlResources.flatMap((resource) => parseJsonLd(resource.html));
    const records = jsonLd.flatMap(flattenJsonLd);
    const hotelRecord = records.find((record) => /Hotel|LodgingBusiness|Campground|Resort|LocalBusiness|BedAndBreakfast/i.test(asText(record["@type"]))) ?? records[0];
    const addressText = hotelRecord ? asText(hotelRecord.address) : "";
    const addressParts = extractAddressParts(hotelRecord?.address, addressText);
    const description = asText(hotelRecord?.description) || getMeta(html, "name", "description") || getMeta(html, "property", "og:description");
    const price = extractLowestPrice(records, html);
    const rating = firstNumber(asRecord(hotelRecord?.aggregateRating)?.ratingValue, hotelRecord?.aggregateRating, hotelRecord?.reviewRating);
    const amenities = collectAmenities(crawledContent, records);
    const type = inferStayType(records, htmlText);
    const name = asText(hotelRecord?.name) || getTitle(html).split(/[|—–-]/)[0].trim();
    const checkInWindow = extractCheckInWindow(hotelRecord, htmlText);
    const gallery = collectGallery(html, records, websiteUrl);
    const policies = extractPoliciesFromText(htmlText, checkInWindow, type);

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
      policies,
      gallery,
      warnings: [
        `Checked ${htmlResources.length} website page${htmlResources.length === 1 ? "" : "s"} and ${documentResources.length} PDF/text document${documentResources.length === 1 ? "" : "s"} for stay details, amenities, services, entertainment, and policies.`,
      ],
    };

    const enrichedDraft = await enrichDraftWithAi(draft, crawledContent, websiteUrl);

    if (!enrichedDraft.name) enrichedDraft.warnings.push("No stay name was found. Add the public property name manually before saving.");
    if (!enrichedDraft.country) enrichedDraft.warnings.push("No country was found. Add the stay country manually before saving.");
    if (!enrichedDraft.placeName) enrichedDraft.warnings.push("No city or region was found. Add the place / region manually before saving.");
    if (!enrichedDraft.price) enrichedDraft.warnings.push("No lowest price was found on the website. Add the lowest public website price manually before saving.");
    if (!enrichedDraft.description) enrichedDraft.warnings.push("No description metadata was found. Copy the stay description from the website manually.");
    if (!enrichedDraft.address) enrichedDraft.warnings.push("No structured address was found. Add the address manually.");
    if (!enrichedDraft.amenities.length) enrichedDraft.warnings.push("No amenities were detected. Add amenities copied from the website manually.");
    if (!enrichedDraft.gallery.length) enrichedDraft.warnings.push("No gallery images were detected. Add public image URLs from the website manually if available.");

    return NextResponse.json({ draft: enrichedDraft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this website." },
      { status: 500 },
    );
  }
}