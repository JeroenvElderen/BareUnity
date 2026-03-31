import { NextResponse } from "next/server";

import { LEGAL_HEATMAP_DATA } from "@/lib/legal-heatmap-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim();

  const data = country
    ? LEGAL_HEATMAP_DATA.filter((entry) => entry.country.toLowerCase() === country.toLowerCase())
    : LEGAL_HEATMAP_DATA;

  return NextResponse.json({
    updatedAt: "2026-03-31",
    count: data.length,
    countries: [...new Set(LEGAL_HEATMAP_DATA.map((entry) => entry.country))],
    entries: data,
  });
}