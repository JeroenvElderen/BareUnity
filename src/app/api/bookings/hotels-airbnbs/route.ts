import { NextResponse } from "next/server";
import { getListings } from "@/app/bookings/hotels-airbnbs/stays-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const listings = await getListings();
  return NextResponse.json({ listings }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}