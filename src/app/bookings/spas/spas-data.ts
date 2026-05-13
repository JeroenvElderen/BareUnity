import path from "node:path";
import type { BookingListing } from "@/components/bookings/booking-listing-types";
import {
  readBookingListingsFromDisk,
  sortBookingListings,
} from "@/lib/booking-data";

export type SpaListing = BookingListing & {
  type: "Day spa" | "Wellness center" | "Thermal spa" | "Massage studio";
};

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/app/bookings/spas/spas-data-store.json",
);

export async function getSpaListings() {
  return sortBookingListings(
    await readBookingListingsFromDisk(DATA_FILE_PATH),
  ) as SpaListing[];
}
