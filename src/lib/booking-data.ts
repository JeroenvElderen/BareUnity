import { readFile } from "node:fs/promises";
import type { BookingListing } from "@/components/bookings/booking-listing-types";

export async function readBookingListingsFromDisk(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as BookingListing[];
}

export function sortBookingListings(listings: BookingListing[]) {
  return [...listings].sort((a, b) => a.name.localeCompare(b.name));
}

export function slugifyBookingListing(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
