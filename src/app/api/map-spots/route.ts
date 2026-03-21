import { NextResponse } from "next/server";

import { db } from "@/server/db";

export async function GET() {
  try {
    const spots = await db.naturist_map_spots.findMany({
      orderBy: { created_at: "desc" },
      take: 500,
      select: {
        id: true,
        name: true,
        description: true,
        latitude: true,
        longitude: true,
        privacy: true,
      },
    });

    return NextResponse.json({ spots });
  } catch (error) {
    console.error("Failed to fetch map spots", error);
    return NextResponse.json({ spots: [] }, { status: 500 });
  }
}