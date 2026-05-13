import path from "node:path";
import type { BookingListing } from "@/components/bookings/booking-listing-types";
import {
  readBookingListingsFromDisk,
  sortBookingListings,
} from "@/lib/booking-data";

export type ActivityListing = BookingListing & {
  type: "Class" | "Workshop" | "Excursion" | "Event" | "Retreat";
};

const DATA_FILE_PATH = path.join(
  process.cwd(),
  "src/app/bookings/activities/activities-data-store.json",
);

export async function getActivityListings() {
  return sortBookingListings(
    await readBookingListingsFromDisk(DATA_FILE_PATH),
  ) as ActivityListing[];
}
