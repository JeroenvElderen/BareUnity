import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAdminRequest } from "@/lib/request-auth";
import { type CountryDiscovery } from "@/lib/country-discovery";

const requestSchema = z.object({
  countryName: z.string().trim().min(2).max(120),
});

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=80";

const fallbackSeason = {
  months: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  air: [18, 18, 19, 20, 22, 25, 27, 27, 25, 23, 21, 19],
  sea: [17, 17, 18, 19, 21, 23, 25, 25, 24, 22, 20, 18],
  vibe: ["🌤️", "🌤️", "☀️", "☀️", "☀️", "☀️", "☀️", "☀️", "☀️", "☀️", "🌤️", "🌤️"],
};

function slugifyCountryName(countryName: string) {
  return countryName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findJsonObject(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.map((item) => safeString(item)).filter(Boolean);
  return strings.length ? strings : fallback;
}

function safeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toCountryDiscovery(value: unknown, countryName: string): CountryDiscovery {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const name = safeString(input.name, countryName);
  const beaches = Array.isArray(input.beaches) ? input.beaches : [];
  const regions = Array.isArray(input.regions) ? input.regions : [];
  const laws = Array.isArray(input.laws) ? input.laws : [];
  const season = (input.season && typeof input.season === "object" ? input.season : {}) as Record<string, unknown>;

  return {
    slug: safeString(input.slug, slugifyCountryName(name)),
    name,
    flag: safeString(input.flag, "🌍"),
    continent: safeString(input.continent, "Researching"),
    tagline: safeString(
      input.tagline,
      `A researched BareUnity naturist discovery profile for ${name}, ready for admin review.`,
    ),
    heroImage: safeString(input.heroImage, DEFAULT_IMAGE),
    legalStatus: safeString(input.legalStatus, "Admin review required"),
    beachesCount: safeString(input.beachesCount, "Review needed"),
    resortsCount: safeString(input.resortsCount, "Review needed"),
    communityRating: safeString(input.communityRating, "New"),
    communityMembers: safeString(input.communityMembers, "0"),
    glance:
      input.glance && typeof input.glance === "object" && !Array.isArray(input.glance)
        ? (input.glance as Record<string, string>)
        : { Capital: "Review needed", Language: "Review needed", Currency: "Review needed" },
    cultureScores:
      input.cultureScores && typeof input.cultureScores === "object" && !Array.isArray(input.cultureScores)
        ? Object.fromEntries(
            Object.entries(input.cultureScores as Record<string, unknown>).map(([key, score]) => [
              key,
              Math.max(0, Math.min(100, safeNumber(score, 50))),
            ]),
          )
        : {
            "Social Acceptance": 50,
            "Beginner Friendly": 50,
            "Family Friendly": 50,
            "LGBT Friendly": 50,
            Safety: 50,
            "Tourist Friendly": 50,
          },
    laws: laws.length
      ? laws.map((law) => {
          const row = (law && typeof law === "object" ? law : {}) as Record<string, unknown>;
          return {
            topic: safeString(row.topic, "Admin review"),
            status: row.status === "allowed" ? "allowed" : "caution",
            summary: safeString(row.summary, "Verify this item against local sources before publishing."),
          };
        })
      : [
          {
            topic: "Public nudity and naturism",
            status: "caution",
            summary: "Verify national and local rules before publishing this profile.",
          },
        ],
    firstTimeTips: safeStringArray(input.firstTimeTips, ["Verify local customs before visiting."]),
    etiquette: safeStringArray(input.etiquette, ["Always ask before taking photos.", "Respect signs and local boundaries."]),
    bestTime: safeString(input.bestTime, "Review local climate and seasonality."),
    regions: regions.map((region, index) => {
      const row = (region && typeof region === "object" ? region : {}) as Record<string, unknown>;
      return {
        name: safeString(row.name, `Region ${index + 1}`),
        score: Math.max(1, Math.round(safeNumber(row.score, index + 1))),
        details: safeString(row.details, "Review local naturist options and accessibility."),
      };
    }),
    beaches: beaches.map((beach) => {
      const row = (beach && typeof beach === "object" ? beach : {}) as Record<string, unknown>;
      return {
        name: safeString(row.name, "Review needed"),
        region: safeString(row.region, "Review needed"),
        rating: safeString(row.rating, "New"),
        image: safeString(row.image, DEFAULT_IMAGE),
        summary: safeString(row.summary, "Verify local access, signage, and naturist customs."),
      };
    }),
    season: {
      months: safeStringArray(season.months, fallbackSeason.months).slice(0, 12),
      air: Array.isArray(season.air) ? season.air.map((item) => safeNumber(item, 20)).slice(0, 12) : fallbackSeason.air,
      sea: Array.isArray(season.sea) ? season.sea.map((item) => safeNumber(item, 20)).slice(0, 12) : fallbackSeason.sea,
      vibe: safeStringArray(season.vibe, fallbackSeason.vibe).slice(0, 12),
    },
    faqs: safeStringArray(input.faqs, ["Is naturism legal here? Verify current local rules before publishing."]),
    tags: safeStringArray(input.tags, [`${name} naturism`, "AI researched", "Admin review required"]),
  };
}

function padSeason(country: CountryDiscovery): CountryDiscovery {
  return {
    ...country,
    season: {
      months: [...country.season.months, ...fallbackSeason.months].slice(0, 12),
      air: [...country.season.air, ...fallbackSeason.air].slice(0, 12),
      sea: [...country.season.sea, ...fallbackSeason.sea].slice(0, 12),
      vibe: [...country.season.vibe, ...fallbackSeason.vibe].slice(0, 12),
    },
  };
}

async function parseOpenAiJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getOpenAiErrorMessage(responseBody: Record<string, unknown> | null) {
  if (responseBody?.error && typeof responseBody.error === "object") {
    return String((responseBody.error as { message?: unknown }).message ?? "OpenAI research failed.");
  }

  return "OpenAI research failed.";
}

function extractOutputText(responseBody: Record<string, unknown>) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;

  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  return output
    .flatMap((item) => {
      const content = item && typeof item === "object" ? (item as { content?: unknown }).content : undefined;
      return Array.isArray(content) ? content : [];
    })
    .map((content) => {
      if (!content || typeof content !== "object") return "";
      const item = content as { text?: unknown };
      return typeof item.text === "string" ? item.text : "";
    })
    .join("\n");
}

function extractSources(responseBody: Record<string, unknown>) {
  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  const citations = output.flatMap((item) => {
    const content = item && typeof item === "object" ? (item as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) return [];

    return content.flatMap((contentItem) => {
      if (!contentItem || typeof contentItem !== "object") return [];
      const annotations = (contentItem as { annotations?: unknown }).annotations;
      if (!Array.isArray(annotations)) return [];
      return annotations;
    });
  });

  const sources = citations
    .map((citation) => {
      if (!citation || typeof citation !== "object") return null;
      const row = citation as { type?: unknown; url?: unknown; title?: unknown };
      if (row.type !== "url_citation" || typeof row.url !== "string") return null;
      return { title: typeof row.title === "string" ? row.title : row.url, url: row.url };
    })
    .filter((source): source is { title: string; url: string } => Boolean(source));

  return Array.from(new Map(sources.map((source) => [source.url, source])).values()).slice(0, 12);
}

export async function POST(request: NextRequest) {
  const authResult = await ensureAdminRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a country name." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Set OPENAI_API_KEY on the server to enable automatic ChatGPT country research." },
      { status: 500 },
    );
  }

  const countryName = parsed.data.countryName;
  const model = process.env.OPENAI_COUNTRY_DISCOVERY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5";
  const prompt = `Research ${countryName} for BareUnity's naturist country discovery page. Use current web search, prefer official government/municipal/tourist-board sources and reputable naturist organizations, and return only valid JSON matching this TypeScript shape:
{
  "slug": string,
  "name": string,
  "flag": string,
  "continent": string,
  "tagline": string,
  "heroImage": string,
  "legalStatus": string,
  "beachesCount": string,
  "resortsCount": string,
  "communityRating": string,
  "communityMembers": string,
  "glance": Record<string, string>,
  "cultureScores": Record<string, number>,
  "laws": Array<{"topic": string, "status": "allowed" | "caution", "summary": string}>,
  "firstTimeTips": string[],
  "etiquette": string[],
  "bestTime": string,
  "regions": Array<{"name": string, "score": number, "details": string}>,
  "beaches": Array<{"name": string, "region": string, "rating": string, "image": string, "summary": string}>,
  "season": {"months": string[], "air": number[], "sea": number[], "vibe": string[]},
  "faqs": string[],
  "tags": string[]
}
Rules:
- Make laws concise and cautious; do not present uncertain legal material as legal advice.
- Include 5-7 law rows covering public nudity, naturist beaches/venues, photography/privacy, family safeguarding, outdoor recreation, and local enforcement.
- Include 5 culture scores from 0-100, 4-6 first-time tips, 4-6 etiquette items, up to 5 regions, up to 4 beaches, exactly 12 season values, and 4-6 FAQs.
- If exact counts are unavailable, use human-readable cautious values like "Review needed" rather than inventing numbers.
- Use a stable Unsplash image URL for heroImage and each beach image.
- Add "AI researched" and "Admin review required" to tags.`;

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input: prompt,
    }),
  });

  const responseBody = await parseOpenAiJsonResponse(openAiResponse);
  if (!openAiResponse.ok) {
    return NextResponse.json({ error: getOpenAiErrorMessage(responseBody) }, { status: 502 });
  }

  if (!responseBody) {
    return NextResponse.json(
      { error: "OpenAI research returned a non-JSON response. Try again." },
      { status: 502 },
    );
  }

  const outputText = extractOutputText(responseBody);
  const jsonText = findJsonObject(outputText);
  if (!jsonText) {
    return NextResponse.json(
      { error: "ChatGPT did not return a country profile JSON object. Try again." },
      { status: 502 },
    );
  }

  try {
    const country = padSeason(toCountryDiscovery(JSON.parse(jsonText), countryName));
    return NextResponse.json({ country, sources: extractSources(responseBody) });
  } catch {
    return NextResponse.json(
      { error: "ChatGPT returned malformed country profile JSON. Try again." },
      { status: 502 },
    );
  }
}