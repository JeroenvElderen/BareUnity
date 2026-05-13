import { NextResponse } from "next/server";
import { getSpaListings } from "@/app/bookings/spas/spas-data";

export async function GET() {
  return NextResponse.json({ listings: await getSpaListings() });
}
