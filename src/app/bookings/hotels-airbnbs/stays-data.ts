import { readFile } from "node:fs/promises";
import path from "node:path";

export type Listing = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: "Hotel" | "Entire place" | "Boutique stay" | "Naturist camping";
  rating: number;
  reviews: number;
  price: number;
  badge: string;
  vibe: string;
  amenities: string[];
  description: string;
  websiteUrl: string;
  address: string;
  checkInWindow: string;
  gallery: string[];
};

const DATA_FILE_PATH = path.join(process.cwd(), "src/app/bookings/hotels-airbnbs/stays-data-store.json");

async function readListingsFromDisk() {
  const raw = await readFile(DATA_FILE_PATH, "utf8");
  return JSON.parse(raw) as Listing[];
}

export async function getListings() {
  return readListingsFromDisk();
}

export async function getListingBySlug(slug: string) {
  const listings = await readListingsFromDisk();
  return listings.find((listing) => listing.slug === slug);
}
