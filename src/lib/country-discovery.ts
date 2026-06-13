import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type CountryLawRow = {
  topic: string;
  status: "allowed" | "caution";
  summary: string;
};

export type CountryRegion = {
  name: string;
  score: number;
  details: string;
};

export type CountryBeach = {
  name: string;
  region: string;
  rating: string;
  image: string;
  summary: string;
};

export type CountryDiscovery = {
  slug: string;
  name: string;
  flag: string;
  continent: string;
  tagline: string;
  heroImage: string;
  legalStatus: string;
  beachesCount: string;
  resortsCount: string;
  communityRating: string;
  communityMembers: string;
  glance: Record<string, string>;
  cultureScores: Record<string, number>;
  laws: CountryLawRow[];
  firstTimeTips: string[];
  etiquette: string[];
  bestTime: string;
  regions: CountryRegion[];
  beaches: CountryBeach[];
  season: {
    months: string[];
    air: number[];
    sea: number[];
    vibe: string[];
  };
  faqs: string[];
  tags: string[];
};

export const COUNTRY_DISCOVERY_TEMPLATE: CountryDiscovery = {
  slug: "template",
  name: "Country",
  flag: "🌍",
  continent: "World",
  tagline:
    "A BareUnity discovery template ready for local laws, beaches, resorts, and community insights.",
  heroImage:
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=80",
  legalStatus: "Researching",
  beachesCount: "Coming soon",
  resortsCount: "Coming soon",
  communityRating: "New",
  communityMembers: "0",
  glance: {
    Capital: "To be added",
    Language: "To be added",
    Population: "To be added",
    Currency: "To be added",
    "Time Zone": "To be added",
    "Driving Side": "To be added",
    "Plug Type": "To be added",
  },
  cultureScores: {
    "Social Acceptance": 0,
    "Beginner Friendly": 0,
    "Family Friendly": 0,
    "LGBT Friendly": 0,
    Safety: 0,
    "Tourist Friendly": 0,
  },
  laws: [
    {
      topic: "Public nudity",
      status: "caution",
      summary: "Local guidance is being prepared for this country.",
    },
    {
      topic: "Naturist beaches",
      status: "caution",
      summary: "Local guidance is being prepared for this country.",
    },
    {
      topic: "Photography rules",
      status: "caution",
      summary: "Ask for consent before taking photos or videos of people.",
    },
  ],
  firstTimeTips: [
    "Check local rules before visiting.",
    "Use marked naturist areas where possible.",
    "Ask before taking photos.",
    "Respect local customs and other visitors.",
  ],
  etiquette: [
    "Always sit on a towel.",
    "Never photograph people without consent.",
    "Respect personal space.",
    "Avoid staring or looking.",
    "Leave no trace and keep beaches clean.",
  ],
  bestTime: "Season guidance is being prepared.",
  regions: [],
  beaches: [],
  season: {
    months: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    air: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sea: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vibe: ["", "", "", "", "", "", "", "", "", "", "", ""],
  },
  faqs: [],
  tags: ["Template country", "Community data needed", "Local tips welcome"],
};

export const COUNTRY_DISCOVERY_DATA: Record<string, CountryDiscovery> = {};

const titleCase = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function getTemplateCountryDiscovery(slug: string): CountryDiscovery {
  const normalizedSlug = slug.toLowerCase();
  const existing = COUNTRY_DISCOVERY_DATA[normalizedSlug];
  if (existing) return existing;

  const name = titleCase(normalizedSlug) || "Country";
  return {
    ...COUNTRY_DISCOVERY_TEMPLATE,
    slug: normalizedSlug,
    name,
    flag: "🌍",
    continent: "World",
    tagline: `A BareUnity discovery template for ${name}, ready for local laws, beaches, resorts, and community insights.`,
    legalStatus: "Researching",
    beachesCount: "Coming soon",
    resortsCount: "Coming soon",
    communityRating: "New",
    communityMembers: "0",
    glance: {
      Capital: "To be added",
      Language: "To be added",
      Population: "To be added",
      Currency: "To be added",
      "Time Zone": "To be added",
      "Driving Side": "To be added",
      "Plug Type": "To be added",
    },
    cultureScores: {
      "Social Acceptance": 0,
      "Beginner Friendly": 0,
      "Family Friendly": 0,
      "LGBT Friendly": 0,
      Safety: 0,
      "Tourist Friendly": 0,
    },
    laws: COUNTRY_DISCOVERY_TEMPLATE.laws,
    firstTimeTips: [
      "Check local rules before visiting.",
      "Use marked naturist areas where possible.",
      "Ask before taking photos.",
      "Respect local customs and other visitors.",
    ],
    etiquette: COUNTRY_DISCOVERY_TEMPLATE.etiquette,
    bestTime: "Season guidance is being prepared.",
    regions: [],
    beaches: [],
    tags: ["Template country", "Community data needed", "Local tips welcome"],
  };
}


export const COUNTRY_DISCOVERY_COLUMNS =
  "slug,name,flag,continent,tagline,hero_image,legal_status,beaches_count,resorts_count,community_rating,community_members,glance,culture_scores,laws,first_time_tips,etiquette,best_time,regions,beaches,season,faqs,tags";

export type CountryDiscoveryRow = {
  slug: string;
  name: string;
  flag: string | null;
  continent: string | null;
  tagline: string | null;
  hero_image: string | null;
  legal_status: string | null;
  beaches_count: string | null;
  resorts_count: string | null;
  community_rating: string | null;
  community_members: string | null;
  glance: unknown;
  culture_scores: unknown;
  laws: unknown;
  first_time_tips: unknown;
  etiquette: unknown;
  best_time: string | null;
  regions: unknown;
  beaches: unknown;
  season: unknown;
  faqs: unknown;
  tags: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown, fallback: Record<string, string>) {
  if (!isRecord(value)) return fallback;

  return Object.entries(value).reduce<Record<string, string>>(
    (record, [key, item]) => {
      record[key] = typeof item === "string" ? item : String(item ?? "");
      return record;
    },
    {},
  );
}

function numberRecord(value: unknown, fallback: Record<string, number>) {
  if (!isRecord(value)) return fallback;

  return Object.entries(value).reduce<Record<string, number>>(
    (record, [key, item]) => {
      const number = Number(item);
      record[key] = Number.isFinite(number) ? number : 0;
      return record;
    },
    {},
  );
}

function stringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function lawRows(value: unknown, fallback: CountryLawRow[]) {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((item) => {
      const record = isRecord(item) ? item : null;
      const status = record?.status === "caution" ? "caution" : "allowed";
      return {
        topic: typeof record?.topic === "string" ? record.topic : "",
        status,
        summary: typeof record?.summary === "string" ? record.summary : "",
      } satisfies CountryLawRow;
    })
    .filter((law) => law.topic && law.summary);
}

function regionRows(value: unknown, fallback: CountryRegion[]) {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((item) => {
      const record = isRecord(item) ? item : null;
      const score = Number(record?.score);
      return {
        name: typeof record?.name === "string" ? record.name : "",
        score: Number.isFinite(score) ? score : 0,
        details: typeof record?.details === "string" ? record.details : "",
      } satisfies CountryRegion;
    })
    .filter((region) => region.name && region.details);
}

function beachRows(value: unknown, fallback: CountryBeach[]) {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((item) => {
      const record = isRecord(item) ? item : null;
      return {
        name: typeof record?.name === "string" ? record.name : "",
        region: typeof record?.region === "string" ? record.region : "",
        rating: typeof record?.rating === "string" ? record.rating : String(record?.rating ?? ""),
        image: typeof record?.image === "string" ? record.image : "",
        summary: typeof record?.summary === "string" ? record.summary : "",
      } satisfies CountryBeach;
    })
    .filter((beach) => beach.name && beach.image);
}

function seasonGuide(value: unknown, fallback: CountryDiscovery["season"]) {
  if (!isRecord(value)) return fallback;

  return {
    months: stringArray(value.months, fallback.months),
    air: Array.isArray(value.air)
      ? value.air.map(Number).filter((item) => Number.isFinite(item))
      : fallback.air,
    sea: Array.isArray(value.sea)
      ? value.sea.map(Number).filter((item) => Number.isFinite(item))
      : fallback.sea,
    vibe: stringArray(value.vibe, fallback.vibe),
  };
}

export function countryDiscoveryFromRow(row: CountryDiscoveryRow): CountryDiscovery {
  const fallback = getTemplateCountryDiscovery(row.slug);

  return {
    slug: row.slug,
    name: row.name,
    flag: row.flag ?? fallback.flag,
    continent: row.continent ?? fallback.continent,
    tagline: row.tagline ?? fallback.tagline,
    heroImage: row.hero_image ?? fallback.heroImage,
    legalStatus: row.legal_status ?? fallback.legalStatus,
    beachesCount: row.beaches_count ?? fallback.beachesCount,
    resortsCount: row.resorts_count ?? fallback.resortsCount,
    communityRating: row.community_rating ?? fallback.communityRating,
    communityMembers: row.community_members ?? fallback.communityMembers,
    glance: stringRecord(row.glance, fallback.glance),
    cultureScores: numberRecord(row.culture_scores, fallback.cultureScores),
    laws: lawRows(row.laws, fallback.laws),
    firstTimeTips: stringArray(row.first_time_tips, fallback.firstTimeTips),
    etiquette: stringArray(row.etiquette, fallback.etiquette),
    bestTime: row.best_time ?? fallback.bestTime,
    regions: regionRows(row.regions, fallback.regions),
    beaches: beachRows(row.beaches, fallback.beaches),
    season: seasonGuide(row.season, fallback.season),
    faqs: stringArray(row.faqs, fallback.faqs),
    tags: stringArray(row.tags, fallback.tags),
  };
}

async function readCountryDiscoveryFromSupabase(slug: string) {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from("country_discovery_profiles")
      .select(COUNTRY_DISCOVERY_COLUMNS)
      .eq("slug", slug.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data ? countryDiscoveryFromRow(data as CountryDiscoveryRow) : null;
  } catch (error) {
    console.error(
      "Failed to load Supabase country discovery profile. Run supabase-country-discovery.sql to create public.country_discovery_profiles.",
      error,
    );
    return null;
  }
}

async function readFeaturedCountriesFromSupabase() {
  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from("country_discovery_profiles")
      .select(COUNTRY_DISCOVERY_COLUMNS)
      .order("name", { ascending: true });

    if (error) throw error;
    return ((data ?? []) as CountryDiscoveryRow[]).map(countryDiscoveryFromRow);
  } catch (error) {
    console.error(
      "Failed to load Supabase country discovery profiles. Run supabase-country-discovery.sql to create public.country_discovery_profiles.",
      error,
    );
    return [];
  }
}

export async function getCountryDiscovery(slug: string): Promise<CountryDiscovery> {
  return (await readCountryDiscoveryFromSupabase(slug)) ?? getTemplateCountryDiscovery(slug);
}

export async function getFeaturedCountries() {
  const countries = await readFeaturedCountriesFromSupabase();
  return countries.length > 0 ? countries : Object.values(COUNTRY_DISCOVERY_DATA);
}