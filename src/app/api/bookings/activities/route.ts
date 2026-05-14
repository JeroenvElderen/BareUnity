import { NextResponse } from "next/server";
import { getActivityListings } from "@/app/bookings/activities/activities-data";

export async function GET() {
  return NextResponse.json({ listings: await getActivityListings() });
}
