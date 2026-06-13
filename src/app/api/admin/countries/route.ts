import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  COUNTRY_DISCOVERY_COLUMNS,
  countryDiscoveryFromRow,
  type CountryDiscoveryRow,
} from "@/lib/country-discovery";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

const stringRecordSchema = z.record(z.string().trim().min(1), z.string().trim());
const numberRecordSchema = z.record(
  z.string().trim().min(1),
  z.coerce.number().min(0).max(100),
);

const lawSchema = z.object({
  topic: z.string().trim().min(1),
  status: z.enum(["allowed", "caution"]),
  summary: z.string().trim().min(1),
});

const regionSchema = z.object({
  name: z.string().trim().min(1),
  score: z.coerce.number().int().min(1),
  details: z.string().trim().min(1),
});

const beachSchema = z.object({
  name: z.string().trim().min(1),
  region: z.string().trim().min(1),
  rating: z.string().trim().min(1),
  image: z.string().trim().url(),
  summary: z.string().trim().min(1),
});

const seasonSchema = z.object({
  months: z.array(z.string().trim().min(1)).length(12),
  air: z.array(z.coerce.number()).length(12),
  sea: z.array(z.coerce.number()).length(12),
  vibe: z.array(z.string().trim().min(1)).length(12),
});

const countryProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug like costa-rica."),
  name: z.string().trim().min(2),
  flag: z.string().trim().min(1),
  continent: z.string().trim().min(2),
  tagline: z.string().trim().min(10).max(400),
  heroImage: z.string().trim().url(),
  legalStatus: z.string().trim().min(2),
  beachesCount: z.string().trim().min(1),
  resortsCount: z.string().trim().min(1),
  communityRating: z.string().trim().min(1),
  communityMembers: z.string().trim().min(1),
  glance: stringRecordSchema,
  cultureScores: numberRecordSchema,
  laws: z.array(lawSchema).min(1),
  firstTimeTips: z.array(z.string().trim().min(1)).min(1),
  etiquette: z.array(z.string().trim().min(1)).min(1),
  bestTime: z.string().trim().min(2),
  regions: z.array(regionSchema),
  beaches: z.array(beachSchema),
  season: seasonSchema,
  faqs: z.array(z.string().trim().min(1)),
  tags: z.array(z.string().trim().min(1)),
});


export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAdminRequest(request);
  if ("error" in authResult) return authResult.error;

  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Country name is required." },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("country_discovery_profiles")
    .select(COUNTRY_DISCOVERY_COLUMNS)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    country: data ? countryDiscoveryFromRow(data as CountryDiscoveryRow) : null,
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAdminRequest(request);
  if ("error" in authResult) return authResult.error;

  const parsed = countryProfileSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid country profile." },
      { status: 400 },
    );
  }

  const country = parsed.data;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("country_discovery_profiles")
    .upsert(
      {
        slug: country.slug,
        name: country.name,
        flag: country.flag,
        continent: country.continent,
        tagline: country.tagline,
        hero_image: country.heroImage,
        legal_status: country.legalStatus,
        beaches_count: country.beachesCount,
        resorts_count: country.resortsCount,
        community_rating: country.communityRating,
        community_members: country.communityMembers,
        glance: country.glance,
        culture_scores: country.cultureScores,
        laws: country.laws,
        first_time_tips: country.firstTimeTips,
        etiquette: country.etiquette,
        best_time: country.bestTime,
        regions: country.regions,
        beaches: country.beaches,
        season: country.season,
        faqs: country.faqs,
        tags: country.tags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("slug,name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ country: data }, { status: 201 });
}
