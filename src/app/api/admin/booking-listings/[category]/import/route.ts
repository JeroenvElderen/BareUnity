import { NextRequest, NextResponse } from "next/server";
import { ensureStayAdmin } from "@/app/api/admin/stays/auth";
import type { SpaListing } from "@/app/bookings/spas/spas-data";

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
  type: SpaListing["type"];
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
const OLLAMA_SPAS_MODEL = process.env.OLLAMA_SPAS_MODEL ?? process.env.OLLAMA_STAYS_MODEL ?? "gpt-oss:120b";
const OLLAMA_REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? 45000);
const MAX_AI_HTML_CHARACTERS = 100000;
const MAX_IMPORT_CRAWL_PAGES = Math.max(1, Number(process.env.SPAS_IMPORT_MAX_CRAWL_PAGES ?? process.env.STAYS_IMPORT_MAX_CRAWL_PAGES ?? 12));
const MAX_IMPORT_DOCUMENTS = Math.max(0, Number(process.env.SPAS_IMPORT_MAX_DOCUMENTS ?? process.env.STAYS_IMPORT_MAX_DOCUMENTS ?? 6));
const MAX_IMPORT_EXTERNAL_LINKS = Math.max(0, Number(process.env.SPAS_IMPORT_MAX_EXTERNAL_LINKS ?? process.env.STAYS_IMPORT_MAX_EXTERNAL_LINKS ?? 4));
const MAX_CRAWLED_CONTENT_CHARACTERS = 300000;
const MAX_POLICY_ITEMS_PER_CATEGORY = 5;
const MAX_POLICY_ITEM_CHARACTERS = 96;
const MIN_REWRITTEN_POLICY_CHARACTERS = 8;
const POLICY_CATEGORY_ORDER = ["Check-in and check-out", "Cancellation", "Accepted payment methods", "Property policy", "Security", "Pets"] as const;
const POLICY_CATEGORY_RANK = new Map<string, number>(POLICY_CATEGORY_ORDER.map((category, index) => [category, index]));

function isListingType(value: string): value is SpaListing["type"] {
  return ["Day spa", "Wellness center", "Thermal spa", "Massage studio"].includes(value);
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
      const category = normalizePolicyCategory(coerceString(record?.category));
      return {
        category,
        items: compactPolicyItems(coerceStringArray(record?.items), category),
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

function normalizePolicyText(value: string) {
  return decodeHtml(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s*[-–—]\s*/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function isQuestionLikePolicyText(value: string) {
  return /\?/.test(value) || /^(?:can|could|do|does|how|is|are|should|what|when|where|which|who|why|will|would)\b/i.test(value.trim());
}

function sentenceCasePolicyItem(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function finalizePolicyItem(value: string) {
  const text = sentenceCasePolicyItem(normalizePolicyText(value).replace(/[.;,\s]+$/, ""));
  if (!text || isQuestionLikePolicyText(text) || text.length > MAX_POLICY_ITEM_CHARACTERS - 1) return "";

  return `${text}.`;
}

function fitPolicyItem(value: string) {
  return finalizePolicyItem(value);
}

function normalizePolicyCategory(value: string) {
  const text = normalizePolicyText(value).replace(/[?:;,.\s]+$/, "");
  if (!text || isQuestionLikePolicyText(value)) return "";
  if (/check[- ]?in|check[- ]?out|arrival|departure/i.test(text)) return "Check-in and check-out";
  if (/cancel|refund|reservation terms/i.test(text)) return "Cancellation";
  if (/payment|pay|card|cash|bank|deposit/i.test(text)) return "Accepted payment methods";
  if (/pet|dog|animal/i.test(text)) return "Pets";
  if (/security|safe|safety|emergency|belongings/i.test(text)) return "Security";
  if (/naturist|nudist|clothing|property|house rule|site rule|community|etiquette|respect/i.test(text)) return "Property policy";

  return "";
}

function cleanPolicyFragment(value: string) {
  return normalizePolicyText(value)
    .replace(/^(?:please|note that|upon arrival,?|during your stay,?)\s+/i, "")
    .replace(/\b(?:you can|you may|guests can)\b/gi, "Guests may")
    .replace(/[.;,\s]+$/, "");
}

function rewritePolicyItem(value: string, category: string) {
  const text = normalizePolicyText(value);
  const lowerCategory = category.toLowerCase();

  if (!text) return "";

  if (lowerCategory.includes("pet")) {
    const maxPets = text.match(/(?:maximum|max)\s+(\d+)\s+pets?/i)?.[1];
    if (maxPets) return `Maximum ${maxPets} pets per accommodation`;

    const lowSeasonFee = text.match(/([€$£]\s*\d+(?:[.,]\d+)?)\s*per\s*week\s*in\s*low\s*season/i)?.[1];
    const highSeasonFee = text.match(/([€$£]\s*\d+(?:[.,]\d+)?)\s*per\s*week\s*in\s*high\s*season/i)?.[1];
    const highSeasonDates = text.match(/(\d{2}\/\d{2}\s*[–-]\s*\d{2}\/\d{2})/)?.[1]?.replace(/\s+/g, "");
    if (/pets? allowed/i.test(text) && (lowSeasonFee || highSeasonFee)) {
      const exclusion = /exclud(?:ing|es)\s+categor(?:y|ies)\s+1\s+and\s+2/i.test(text) ? "Cat. 1/2 excluded; " : "";
      const fees = uniqueStrings([lowSeasonFee && `${lowSeasonFee} low season`, highSeasonFee && `${highSeasonFee} high season`, highSeasonDates]).join("; ");
      return fitPolicyItem(`Pets allowed; ${exclusion}${fees}`);
    }

    if (/pets? allowed/i.test(text)) return "Pets allowed; confirm limits before booking";
    if (/leash/i.test(text) && /vaccinat/i.test(text)) return "Pets must be leashed and vaccinated";
    if (/leash/i.test(text)) return "Pets must be kept on a leash";
    if (/vaccinat/i.test(text)) return "Pets must be vaccinated";
    if (/confirm|booking|before booking/i.test(text)) return "Confirm pet rules before booking";
    if (/responsib|cleanliness|behaviour|behavior/i.test(text)) return "Owners responsible for behaviour and cleanliness";
    if (/restriction|room|accommodation type/i.test(text)) return "Pet restrictions may vary by accommodation";
  }

  if (lowerCategory.includes("check-in")) {
    const checkIn = text.match(/check[- ]?in\s*(?:from|after|at)?\s*([\w:./-]+(?:\s*[ap]m)?|afternoon|morning|evening)/i)?.[1];
    const checkOut = text.match(/check[- ]?out\s*(?:by|before|at)?\s*([\w:./-]+(?:\s*[ap]m)?|afternoon|morning|evening)/i)?.[1];
    if (checkIn || checkOut) return uniqueStrings([checkIn && `Check-in ${checkIn}`, checkOut && `check-out ${checkOut}`]).join("; ");
    if (/late arrival|late check[- ]?in/i.test(text)) return "Late arrival subject to property approval";
    if (/arrival times?|reception hours/i.test(text)) return "Arrival times confirmed by reception";
  }

  if (lowerCategory.includes("cancellation")) {
    if (/non[- ]?refundable/i.test(text)) return "Non-refundable conditions may apply";
    if (/selected rate|booking dates|rate/i.test(text)) return "Cancellation depends on rate and booking dates";
    if (/season/i.test(text)) return "Seasonal cancellation conditions may apply";
    if (/refund/i.test(text)) return "Refunds follow property reservation terms";
    if (/deposit|no[- ]?show/i.test(text)) return "Deposits/no-show terms follow booking conditions";
    if (/cancel/i.test(text)) return "Cancellation terms follow booking conditions";
  }

  if (lowerCategory.includes("payment")) {
    if (/advance|prepayment|deposit/i.test(text)) return "Advance payment or deposit may be required";
    if (/additional|separate|extra|supplement/i.test(text)) return "Extras may be charged separately";
    if (/cash/i.test(text) && /card|visa|mastercard/i.test(text)) return "Cash and card payments may be accepted";
    if (/card|visa|mastercard/i.test(text)) return "Card payment may be accepted";
    if (/bank transfer/i.test(text)) return "Bank transfer may be accepted";
    if (/payment|pay/i.test(text)) return "Payment methods confirmed on booking website";
  }

  if (lowerCategory.includes("house rules")) {
    if (/quiet hours|noise/i.test(text)) return "Quiet hours and noise rules apply";
    if (/self[- ]?respect/i.test(text) && /others/i.test(text) && /environment|nature/i.test(text)) return "Respect self, others, nature, and the environment";
    if (/family[- ]?oriented/i.test(text) && /naturism/i.test(text)) return "Family-oriented naturist values apply";
    if (/respect/i.test(text) && /environment|nature/i.test(text)) return "Respect nature and the environment";
    if (/respect/i.test(text)) return "Respectful behaviour is expected";
    if (/must|required/i.test(text)) return fitPolicyItem(cleanPolicyFragment(text));
    if (/not allowed|prohibited/i.test(text)) return fitPolicyItem(cleanPolicyFragment(text));
  }

  if (lowerCategory.includes("naturist") || lowerCategory.includes("property policy")) {
    if (/designated/i.test(text) && /naturist|nudist|clothing optional|textile/i.test(text)) return "Naturist etiquette applies in designated areas";
    if (/clothing|textile|weather|activity/i.test(text)) return "Clothing rules may vary by area or activity";
    if (/community|etiquette|standard/i.test(text)) return "Respect site rules and community standards";
    if (/family[- ]?oriented/i.test(text) && /naturism/i.test(text)) return "Family-oriented naturist values apply";
    if (/respect/i.test(text) && /environment|nature/i.test(text)) return "Respect nature and the environment";
    if (/respect/i.test(text)) return "Respectful naturist behaviour is expected";
  }

  if (lowerCategory.includes("accessibility")) {
    if (/wheelchair|disabled|mobility/i.test(text)) return fitPolicyItem(cleanPolicyFragment(text));
    if (/accessible on foot|on foot from/i.test(text)) return "Accessible on foot from the campsite";
    if (/easily accessible|accessible/i.test(text)) return "Area is described as accessible";
  }

  if (lowerCategory.includes("security")) {
    if (/belongings|liability|responsib/i.test(text)) return "Guests are responsible for personal belongings";
    if (/emergency/i.test(text)) return "Emergency procedures managed by property";
    if (/reception|host|contact/i.test(text)) return "Reception/host contact during opening hours";
    if (/safe|safety|security/i.test(text)) return "Property safety rules apply";
  }

  if (lowerCategory.includes("children") || lowerCategory.includes("famil")) {
    if (/adult only|adults only/i.test(text)) return "Adults-only conditions may apply";
    if (/playground|play area/i.test(text)) return "Children's play area available";
    if (/children|kids|family|families/i.test(text) && /allowed|welcome/i.test(text)) return "Children and families welcome";
  }

  return text.length <= MAX_POLICY_ITEM_CHARACTERS ? cleanPolicyFragment(text) : "";
}

function policySpecificityScore(item: string) {
  const text = item.toLowerCase();
  let score = item.length;
  if (/\b\d/.test(text)) score += 80;
  if (/\b(?:allowed|required|must|by|from|until|between|leash|vaccinated|cash|card|bank|non-refundable)\b/.test(text)) score += 30;
  if (/\b(?:confirm|may apply|may be|required separately|booking website|property safety rules apply|expected)\b/.test(text)) score -= 35;

  return score;
}

function policyDedupeKey(item: string, category: string) {
  const text = item.toLowerCase();

  if (category === "Pets") {
    if (/maximum\s+\d+\s+pets?/.test(text)) return "max-pets";
    if (/leash|vaccinat/.test(text)) return "pet-control";
    if (/owner|behaviour|behavior|cleanliness/.test(text)) return "pet-owner";
    if (/restriction|room|accommodation/.test(text)) return "pet-restrictions";
    if (/confirm|before booking/.test(text)) return "pet-confirm";
    if (/pets? allowed/.test(text)) return "pets-allowed";
  }

  if (category === "Property policy") {
    if (/season|open|operates|april|september|october/.test(text)) return "property-season";
    if (/clothing|textile|clothes/.test(text)) return "property-clothing";
    if (/naturist|nudist|etiquette|designated/.test(text)) return "property-naturist";
    if (/quiet|noise/.test(text)) return "property-quiet";
    if (/respect|community|standard|behaviour|behavior|nature|environment/.test(text)) return "property-respect";
  }

  if (category === "Check-in and check-out") {
    if (/check[- ]?in|check[- ]?out/.test(text)) return "check-times";
    if (/late/.test(text)) return "late-arrival";
    if (/arrival|reception/.test(text)) return "arrival";
  }

  if (category === "Cancellation") {
    if (/refund/.test(text)) return "refunds";
    if (/season/.test(text)) return "cancel-season";
    if (/deposit|no-show/.test(text)) return "cancel-deposit";
    if (/cancel|rate|booking dates|terms/.test(text)) return "cancel-terms";
  }

  if (category === "Accepted payment methods") {
    if (/cash|card|visa|mastercard|bank transfer/.test(text)) return "payment-methods";
    if (/advance|prepayment|deposit/.test(text)) return "advance-payment";
    if (/extra|additional|separate|supplement/.test(text)) return "payment-extras";
    if (/payment|pay/.test(text)) return "payment-generic";
  }

  if (category === "Security") {
    if (/belongings|liability|responsib/.test(text)) return "security-belongings";
    if (/emergency/.test(text)) return "security-emergency";
    if (/reception|host|contact/.test(text)) return "security-contact";
    if (/safe|safety|security/.test(text)) return "security-safety";
  }

  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function removeGenericPolicyItems(items: string[], category: string) {
  const concreteKeys = new Set(items.map((item) => policyDedupeKey(item, category)));
  const hasConcretePetRules = ["max-pets", "pet-control", "pet-owner", "pet-restrictions", "pets-allowed"].some((key) => concreteKeys.has(key));
  const hasConcretePaymentMethods = concreteKeys.has("payment-methods");
  const hasSpecificSecurity = ["security-belongings", "security-emergency", "security-contact"].some((key) => concreteKeys.has(key));

  return items.filter((item) => {
    const text = item.toLowerCase();
    const key = policyDedupeKey(item, category);
    if (category === "Pets" && hasConcretePetRules && key === "pet-confirm") return false;
    if (category === "Accepted payment methods" && hasConcretePaymentMethods && key === "payment-generic") return false;
    if (category === "Security" && hasSpecificSecurity && key === "security-safety") return false;
    if (category === "Property policy" && /located in|perfect for|refreshing haven|club encourages|advocate/.test(text)) return false;

    return true;
  });
}

function compactPolicyItems(items: string[], category: string) {
  const bestByKey = new Map<string, string>();

  for (const item of items) {
    const finalized = finalizePolicyItem(rewritePolicyItem(item, category));
    if (finalized.length < MIN_REWRITTEN_POLICY_CHARACTERS) continue;

    const key = policyDedupeKey(finalized, category);
    const existing = bestByKey.get(key);
    if (!existing || policySpecificityScore(finalized) > policySpecificityScore(existing)) {
      bestByKey.set(key, finalized);
    }
  }

  return removeGenericPolicyItems([...bestByKey.values()], category).slice(0, MAX_POLICY_ITEMS_PER_CATEGORY);
}

function isPolicyLikeSentence(sentence: string, category: string) {
  const text = normalizePolicyText(sentence);
  const lowerCategory = category.toLowerCase();

  if (/\b(?:discover|enjoy|unique holiday|memories|laughter|adventure|activities|programme|gym|yoga|surfing|workshops|entertainment|restaurant|bar|spa|pool|beach access|pine forest|refreshing haven|perfect for|club encourages|creativity)\b/i.test(text)) {
    return false;
  }

  if (/\b(?:located in|is located|region)\b/i.test(text)) {
    return false;
  }

  if (lowerCategory.includes("check-in")) {
    return /\b(?:check[- ]?in|check[- ]?out|arrival times?|departure|reception hours|late arrival|late check[- ]?in)\b/i.test(text);
  }

  if (lowerCategory.includes("property policy")) {
    return /\b(?:house rules|site rules|quiet hours|noise|must|required|not allowed|prohibited|respect|behaviour|behavior|naturist|nudist|clothing optional|clothes free|textile|etiquette|designated|open|season)\b/i.test(text);
  }

  return true;
}

function mergePolicyDrafts(basePolicies: PolicyDraft[], aiPolicies: PolicyDraft[] | undefined) {
  const byCategory = new Map<string, PolicyDraft>();

  for (const policy of [...basePolicies, ...(aiPolicies ?? [])]) {
    const category = normalizePolicyCategory(policy.category);
    if (!category || !policy.items.length) continue;
    const existing = byCategory.get(category);
    byCategory.set(category, {
      category,
      items: compactPolicyItems([...(existing?.items ?? []), ...policy.items], category),
    });
  }

  return [...byCategory.values()].sort((a, b) => (POLICY_CATEGORY_RANK.get(a.category) ?? 99) - (POLICY_CATEGORY_RANK.get(b.category) ?? 99));
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
    address: chooseBestAddress(baseDraft.address, aiDraft.address),
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

  const prompt = `Extract a BareUnity spa listing from this public spa or wellness website crawl. Use only facts present in the crawled HTML/text/PDF content. Do a thorough check of services, facilities, amenities, activities, entertainment, house rules, booking terms, cancellation, payment, pets, naturist rules, check-in/out, privacy/terms, FAQ, and downloadable PDF/document content. Return strict JSON with these keys: slug, name, country, placeName, type, rating, price, badge, vibe, amenities, description, websiteUrl, address, checkInWindow, policies, gallery. type must be one of Day spa, Wellness center, Thermal spa, Massage studio. amenities should include Services and/or Entertainment when the website mentions entertainment and/or services, recreation, events, shows, music, games, animation, or activity programmes. Write the listing in the concise BareUnity style shown by this example: badge "Naturist wellness & spa", vibe "Thermal circuits · Massage rituals · Quiet recovery energy", description as 1-2 factual sentences, and policies grouped as Check-in and check-out, Cancellation, Accepted payment methods, Property policy, Security, and Pets when those facts exist. policies must be an array of {"category":"...","items":["..."]} based on visible website/document policy text, not generic assumptions. Only use the six policy categories listed above; fold house rules and naturist rules into Property policy, and do not create separate Children, Accessibility, House rules, or Naturist rules sections. Policies are facts only: never write questions, FAQ prompts, question-mark text, or uncertain user-facing questions inside policy categories or policy items. Rewrite policies into compact BareUnity-friendly declarative sentences using only facts found in the website content. Each policy item must be a complete short sentence ending with a period, max ${MAX_POLICY_ITEMS_PER_CATEGORY} items per category and max ${MAX_POLICY_ITEM_CHARACTERS} characters per item. Combine related facts, keep prices/dates/times/limits when present, and exclude marketing text, destination descriptions, amenity lists, and activity programme details from policies. gallery must contain public image URLs only. If a fact is missing, use an empty string, null, or empty array.

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
        model: OLLAMA_SPAS_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          {
            role: "system",
            content: "You are a careful travel data extraction assistant. Never invent missing details. Return only valid JSON. Write policy categories and items as declarative facts only, never as questions or FAQ prompts.",
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
    enrichedDraft.warnings.push(`Ollama enrichment applied with ${OLLAMA_SPAS_MODEL}. Review all fields before saving.`);
    return enrichedDraft;
  } catch (error) {
    baseDraft.warnings.push(`Ollama enrichment failed: ${error instanceof Error ? error.message : "unknown provider error"}. Parser data was kept. On Vercel, set OLLAMA_API_BASE_URL=https://ollama.com/api plus OLLAMA_API_KEY; locally, make sure Ollama is running and the ${OLLAMA_SPAS_MODEL} model is pulled.`);
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
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#xA0;/gi, " ")
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

function isSkippedExternalHost(url: URL) {
  return /(?:^|\.)(?:facebook|instagram|twitter|x|youtube|youtu|tiktok|linkedin|pinterest|tripadvisor|google|googleapis|gstatic|bing|apple|paypal|stripe|adyen|cloudflare)\./i.test(url.hostname);
}

function getCrawlUrlText(url: URL) {
  const value = `${url.hostname} ${url.pathname} ${url.search}`;
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function isAddressCandidateUrl(url: URL) {
  return /\b(?:address|adresse|direcci[oó]n|indirizzo|endere[cç]o|adres|kontakt|contatti|contacto|contactez|contact|ubicaci[oó]n|localisation|location|directions|route|visit|find-us|where-we-are|how-to-find|access|map|maps|booking|reservation)\b/i.test(getCrawlUrlText(url));
}

function scoreCrawlUrl(url: URL) {
  const value = getCrawlUrlText(url);
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
    "address",
    "adresse",
    "dirección",
    "direccion",
    "indirizzo",
    "endereço",
    "endereco",
    "adres",
    "kontakt",
    "contatti",
    "contacto",
    "contactez",
    "ubicacion",
    "ubicación",
    "localisation",
    "route",
    "directions",
    "visit",
    "find-us",
  ];
  return priorityTerms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
}

function collectCrawlLinks(html: string, pageUrl: URL, rootUrl: URL) {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeCrawlUrl(match[1] ?? "", pageUrl))
    .filter((url): url is URL => {
      if (!url || !["http:", "https:"].includes(url.protocol) || (!isHtmlLikeUrl(url) && !isDocumentUrl(url))) return false;
      if (isSameOriginCrawlUrl(url, rootUrl)) return true;
      return !isSkippedExternalHost(url) && isAddressCandidateUrl(url);
    });

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
      "User-Agent": "BareUnity spa listing importer (+https://bareunity.com)",
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

async function crawlSpaWebsite(rootUrl: URL) {
  const resources: CrawledResource[] = [];
  const visited = new Set<string>();
  const queue: URL[] = [rootUrl];
  const htmlLimit = Number.isFinite(MAX_IMPORT_CRAWL_PAGES) ? MAX_IMPORT_CRAWL_PAGES : 12;
  const documentLimit = Number.isFinite(MAX_IMPORT_DOCUMENTS) ? MAX_IMPORT_DOCUMENTS : 6;
  let htmlCount = 0;
  let documentCount = 0;
  let externalCount = 0;

  while (queue.length && (htmlCount < htmlLimit || documentCount < documentLimit)) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;

    const normalized = normalizeCrawlUrl(pageUrl.toString(), rootUrl);
    if (!normalized) continue;
    const href = normalized.toString();
    if (visited.has(href)) continue;
    const isExternal = !isSameOriginCrawlUrl(normalized, rootUrl);
    if (isExternal && (!isAddressCandidateUrl(normalized) || isSkippedExternalHost(normalized))) continue;

    const wantsDocument = isDocumentUrl(normalized);
    if (wantsDocument && documentCount >= documentLimit) continue;
    if (!wantsDocument && htmlCount >= htmlLimit) continue;
    if (isExternal && externalCount >= MAX_IMPORT_EXTERNAL_LINKS) continue;

    visited.add(href);
    if (isExternal) externalCount += 1;

    try {
      const resource = await fetchCrawlResource(normalized);
      resources.push(resource);

      if (resource.kind === "html") {
        htmlCount += 1;
        const links = collectCrawlLinks(resource.html, normalized, rootUrl).filter((link) => !visited.has(link.toString()));
        queue.push(...links);
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

const META_KEYS = new Set(["description", "og:description", "og:image", "og:title"]);

function getMeta(html: string, selector: "name" | "property", key: string) {
  if (!META_KEYS.has(key)) return "";

  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const metaTag of metaTags) {
    const attributes = new Map<string, string>();
    for (const [, rawName, , rawValue] of metaTag.matchAll(/([^\s"'<>/=]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
      if (rawName && rawValue !== undefined) {
        attributes.set(rawName.toLowerCase(), rawValue);
      }
    }

    if (attributes.get(selector) === key) {
      const content = attributes.get("content");
      if (content) return decodeHtml(content);
    }
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

function cleanAddressCandidate(value: string) {
  return decodeHtml(value)
    .replace(/\s+/g, " ")
    .replace(/^[,;:|•\s-]+|[,;:|•\s-]+$/g, "")
    .trim();
}

function hasStreetNumber(value: string) {
  return /\b[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}\s+\d{1,5}[A-Za-z]?(?:[-/]\d+)?\b/u.test(value);
}

function hasPostalCode(value: string) {
  return /\b(?:[1-9]\d{3}\s?[A-Z]{2}|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{4,6}(?:[-\s]\d{3,4})?)\b/i.test(value);
}

function isLikelyNavigationAddress(value: string) {
  return /^(?:&\s*)?(?:route|directions|opening|hours|prices|tickets|faq|questions|reservation|booking|contact)\b/i.test(value)
    || /\b(?:zwangerschap|overnachten|giftcard|badkledingdagen|veelgestelde vragen|reservering wijzigen)\b/i.test(value);
}

function isSpecificStreetAddress(value: string) {
  const cleaned = cleanAddressCandidate(value);
  if (!cleaned || isLikelyNavigationAddress(cleaned)) return false;
  return hasStreetNumber(cleaned) || (hasPostalCode(cleaned) && /\p{L}/u.test(cleaned));
}

function addressSpecificityScore(value: string) {
  const cleaned = cleanAddressCandidate(value);
  if (!cleaned || isLikelyNavigationAddress(cleaned)) return -1000;

  let score = 0;
  if (hasStreetNumber(cleaned)) score += 100;
  if (hasPostalCode(cleaned)) score += 80;
  if (/[,]/.test(cleaned)) score += 10;
  if (/\b(?:street|straat|strasse|straße|road|route|rue|avenue|laan|dreef|weg|plein|place|drive|lane|boulevard|gade|väg|via|calle)\b/i.test(cleaned)) score += 20;
  if (cleaned.length >= 12 && cleaned.length <= 120) score += 15;
  if (cleaned.length > 160) score -= 60;
  return score;
}

function chooseBestAddress(primary: string, fallback: string | undefined) {
  const candidates = uniqueStrings([primary, fallback ?? ""].map(cleanAddressCandidate).filter(Boolean));
  return candidates.sort((a, b) => addressSpecificityScore(b) - addressSpecificityScore(a))[0] ?? "";
}

function extractPostalAddressCandidates(text: string) {
  const normalized = decodeHtml(text).replace(/\s+/g, " ").trim();
  const patterns = [
    /\b([\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}\s+\d{1,5}[A-Za-z]?(?:[-/]\d+)?\s*,?\s*[1-9]\d{3}\s?[A-Z]{2}\s+[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,3})\b/giu,
    /\b([\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}\s+\d{1,5}[A-Za-z]?(?:[-/]\d+)?\s*,?\s*\d{4,6}\s+[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,3})\b/giu,
    /\b(\d{1,5}\s+[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}\s*,?\s+[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,3}\s+\d{4,6})\b/giu,
  ];

  return uniqueStrings(patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => cleanAddressCandidate(match[1] ?? ""))))
    .filter(isSpecificStreetAddress);
}

function formatNominatimAddress(value: JsonValue) {
  const record = asRecord(value);
  const address = asRecord(record?.address);
  if (!address) return cleanAddressCandidate(asText(record?.display_name));

  const road = asText(address.road ?? address.pedestrian ?? address.footway ?? address.cycleway ?? address.path ?? address.neighbourhood);
  const houseNumber = asText(address.house_number);
  const postcode = asText(address.postcode);
  const city = asText(address.city ?? address.town ?? address.village ?? address.municipality ?? address.county);
  const country = asText(address.country);
  const street = uniqueStrings([road, houseNumber]).join(" ");
  const locality = uniqueStrings([postcode, city]).join(" ");
  return cleanAddressCandidate(uniqueStrings([street, locality, country]).join(", "));
}

async function findAddressWithPlaceSearch(name: string, placeName: string, websiteUrl: URL) {
  const query = uniqueStrings([name, placeName, websiteUrl.hostname.replace(/^www\./, ""), "address"].filter(Boolean)).join(" ");
  if (!query.trim()) return "";

  const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("format", "jsonv2");
  searchUrl.searchParams.set("addressdetails", "1");
  searchUrl.searchParams.set("limit", "3");

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "BareUnity spa listing importer (+https://bareunity.com)",
        Accept: "application/json",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return "";

    const payload = (await response.json()) as JsonValue;
    if (!Array.isArray(payload)) return "";

    return payload.map(formatNominatimAddress).find(isSpecificStreetAddress) ?? "";
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

function findRecordWithAddress(records: Record<string, JsonValue>[], preferredType: RegExp) {
  return records.find((record) => preferredType.test(asText(record["@type"])) && asText(record.address))
    ?? records.find((record) => asText(record.address))
    ?? records[0];
}

function extractInlineAddressFromText(text: string) {
  const normalized = decodeHtml(text).replace(/\s+/g, " ").trim();
  const labelPattern = String.raw`(?:address|adresse|direcci[oó]n|indirizzo|endere[cç]o|adres|adresă|kontakt|contatti|contacto|ubicaci[oó]n|localisation|location|directions|route|visit us|find us|how to find us|where we are|dirección|endereço|adresse postale|postal address|anschrift|dirección postal|địa chỉ|住所|地址|地址|عنوان)`;
  const labelledCandidates = [...normalized.matchAll(new RegExp(`${labelPattern}\\s*[:：-]?\\s*([^|•]{12,220})`, "giu"))]
    .map((match) => (match[1] ?? "").replace(/(?:phone|tel|telephone|email|e-mail|contact|website|opening|hours|horaires|öffnungszeiten|telefono|teléfono|téléphone).*$/iu, ""))
    .map(cleanAddressCandidate)
    .filter((candidate) => /\p{L}/u.test(candidate) && (/[0-9]/.test(candidate) || /,/.test(candidate)) && candidate.length >= 12 && candidate.length <= 180)
    .filter((candidate) => !isLikelyNavigationAddress(candidate));

  const candidates = uniqueStrings([...extractPostalAddressCandidates(normalized), ...labelledCandidates]);
  return candidates.sort((a, b) => addressSpecificityScore(b) - addressSpecificityScore(a))[0] ?? "";
}

function inferSpaType(records: Record<string, JsonValue>[], htmlText: string): SpaListing["type"] {
  const typeText = `${records.map((record) => asText(record["@type"])).join(" ")} ${htmlText}`;
  if (/thermal|hot spring|mineral bath|terme|therme|onsen/i.test(typeText)) return "Thermal spa";
  if (/massage|bodywork|massage studio|therapist/i.test(typeText)) return "Massage studio";
  if (/wellness|retreat|health club|sauna|hammam|hydrotherapy/i.test(typeText)) return "Wellness center";
  return "Day spa";
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

  return "Check the spa website for current treatment availability";
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

function buildBadge(type: SpaListing["type"], amenities: string[]) {
  if (type === "Thermal spa") return "Thermal wellness spa";
  if (type === "Massage studio") return "Massage & bodywork studio";
  if (amenities.some((amenity) => /sauna|hammam|steam|thermal/i.test(amenity))) return "Sauna & wellness spa";
  if (type === "Wellness center") return "Wellness center";
  return "Website-sourced spa";
}

function buildVibe(type: SpaListing["type"], placeName: string, amenities: string[]) {
  const highlights = amenities
    .filter((amenity) => /pool|sauna|spa|massage|thermal|hammam|steam|treatment|relaxation|wellness|garden|terrace/i.test(amenity))
    .slice(0, 3);
  return uniqueStrings([type, placeName, ...highlights]).join(" · ") || "Website-sourced spa";
}

function collectPolicyItems(text: string, matcher: RegExp, category: string) {
  const items: string[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 240);

  for (const sentence of sentences) {
    if (matcher.test(sentence) && isPolicyLikeSentence(sentence, category)) {
      items.push(sentence.replace(/^[•\-*\d.)\s]+/, ""));
    }
  }

  return compactPolicyItems(items, category);
}

function extractPoliciesFromText(text: string, checkInWindow: string): PolicyDraft[] {
  const policyMatchers: Array<[string, RegExp]> = [
    ["Check-in and check-out", /\b(?:check[- ]?in|check[- ]?out|arrival|departure|reception hours|late arrival)\b/i],
    ["Cancellation", /\b(?:cancell?ation|cancel|refund|non[- ]?refundable|deposit|no[- ]?show)\b/i],
    ["Accepted payment methods", /\b(?:payment|pay|credit card|visa|mastercard|cash|bank transfer|deposit|prepayment)\b/i],
    ["Property policy", /\b(?:house rules|site rules|rules|quiet hours|noise|respect|behaviour|behavior|naturist|nudist|clothing optional|clothes free|textile|etiquette|season|open)\b/i],
    ["Security", /\b(?:security|safe|safety|emergency|liability|belongings|responsibility)\b/i],
    ["Pets", /\b(?:pet|pets|dog|dogs|animal|animals)\b/i],
  ];

  const extracted = policyMatchers
    .map(([category, matcher]) => ({ category, items: collectPolicyItems(text, matcher, category) }))
    .filter((policy) => policy.items.length);

  return mergePolicyDrafts(extracted, buildFallbackPolicies(checkInWindow));
}

function buildFallbackPolicies(checkInWindow: string): PolicyDraft[] {
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
      items: ["Guests are expected to follow spa and wellness rules", "Quiet hours and shared-space etiquette may apply", "Facilities, treatments, and services may vary by season"],
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

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category")?.trim() ?? "spas";
  if (category !== "spas") return NextResponse.json({ error: "Spa import is only available for the spas category." }, { status: 404 });

  const url = searchParams.get("url")?.trim() ?? "";
  if (!url) return NextResponse.json({ error: "Missing website URL." }, { status: 400 });

  let websiteUrl: URL;
  try {
    websiteUrl = new URL(url);
    if (!["http:", "https:"].includes(websiteUrl.protocol)) throw new Error("Unsupported protocol");
  } catch {
    return NextResponse.json({ error: "Enter a valid http(s) website URL." }, { status: 400 });
  }

  try {
    const crawledResources = await crawlSpaWebsite(websiteUrl);
    if (!crawledResources.length) return NextResponse.json({ error: "No crawlable website pages or documents were found." }, { status: 502 });

    const htmlResources = crawledResources.filter((resource) => resource.kind === "html");
    const documentResources = crawledResources.filter((resource) => resource.kind !== "html");
    const html = htmlResources.map((resource) => resource.html).join("\n\n");
    const htmlText = crawledResources.map((resource) => `URL: ${resource.url}\nTYPE: ${resource.kind.toUpperCase()}\n${resource.text}`).join("\n\n");
    const crawledContent = combineCrawledContent(crawledResources);
    const jsonLd = htmlResources.flatMap((resource) => parseJsonLd(resource.html));
    const records = jsonLd.flatMap(flattenJsonLd);
    const hotelRecord = findRecordWithAddress(records, /Spa|HealthAndBeautyBusiness|LocalBusiness|Resort|Hotel|LodgingBusiness|BeautySalon/i);
    const name = asText(hotelRecord?.name) || getTitle(html).split(/[|—–-]/)[0].trim();
    let addressText = chooseBestAddress(asText(hotelRecord?.address), extractInlineAddressFromText(htmlText));
    let addressParts = extractAddressParts(hotelRecord?.address, addressText);
    if (!isSpecificStreetAddress(addressText)) {
      const searchedAddress = await findAddressWithPlaceSearch(name, addressParts.placeName, websiteUrl);
      addressText = chooseBestAddress(addressText, searchedAddress);
      addressParts = extractAddressParts(hotelRecord?.address, addressText);
    }
    const description = asText(hotelRecord?.description) || getMeta(html, "name", "description") || getMeta(html, "property", "og:description");
    const price = extractLowestPrice(records, html);
    const rating = firstNumber(asRecord(hotelRecord?.aggregateRating)?.ratingValue, hotelRecord?.aggregateRating, hotelRecord?.reviewRating);
    const amenities = collectAmenities(crawledContent, records);
    const type = inferSpaType(records, htmlText);
    const checkInWindow = extractCheckInWindow(hotelRecord, htmlText);
    const gallery = collectGallery(html, records, websiteUrl);
    const policies = extractPoliciesFromText(htmlText, checkInWindow);

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
        `Checked ${htmlResources.length} website page${htmlResources.length === 1 ? "" : "s"} and ${documentResources.length} PDF/text document${documentResources.length === 1 ? "" : "s"}, including linked contact/location pages when available, for spa details, addresses, amenities, services, treatments, and policies.`,
      ],
    };

    const enrichedDraft = await enrichDraftWithAi(draft, crawledContent, websiteUrl);

    if (!enrichedDraft.name) enrichedDraft.warnings.push("No spa name was found. Add the public spa name manually before saving.");
    if (!enrichedDraft.country) enrichedDraft.warnings.push("No country was found. Add the spa country manually before saving.");
    if (!enrichedDraft.placeName) enrichedDraft.warnings.push("No city or region was found. Add the place / region manually before saving.");
    if (!enrichedDraft.price) enrichedDraft.warnings.push("No lowest price was found on the website. Add the lowest public website price manually before saving.");
    if (!enrichedDraft.description) enrichedDraft.warnings.push("No description metadata was found. Copy the spa description from the website manually.");
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