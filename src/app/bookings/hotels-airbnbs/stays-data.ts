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

export const listings: Listing[] = [
  {
    slug: "athena-naturist-park-ossendrecht",
    name: "Athena Naturist Park",
    country: "Netherlands",
    placeName: "Ossendrecht · North Brabant",
    type: "Naturist camping",
    rating: 8.5,
    reviews: 200,
    price: 35,
    badge: "Naturist wellness & spa",
    vibe: "Naturist retreat · Forest camping & glamping · Social clubhouse energy",
    amenities: [
      "Pool",
      "Sauna",
      "Sunbathing lawn",
      "Clubhouse",
      "Bar",
      "Terrace",
      "Fresh bread service",
      "Communal meals",
      "Sanitary facilities",
      "Showers",
      "Laundry",
      "WiFi",
      "Playground",
      "Sports courts",
      "Activities",
      "BBQ",
      "Camping pitches",
      "Glamping",
      "Parking",
      "Cycling access",
    ],
    description:
      "Relaxed naturist park set in forest surroundings with camping and glamping options, a wellness area with sauna and pool, and a friendly clubhouse scene with regular social activities.",
    websiteUrl: "https://naturisme-athena.org/ossendrecht/",
    address: "Postbaan 8, 4641 RM Ossendrecht, Netherlands",
    checkInWindow: "Check-in afternoon · Check-out morning",
    gallery: [
      "https://picsum.photos/seed/athena-ossendrecht-0/1200/800",
      "https://picsum.photos/seed/athena-ossendrecht-1/1200/800",
      "https://picsum.photos/seed/athena-ossendrecht-2/1200/800",
      "https://picsum.photos/seed/athena-ossendrecht-3/1200/800",
      "https://picsum.photos/seed/athena-ossendrecht-4/1200/800",
    ],
  },
];

export async function getListings() {
  return listings;
}

export async function getListingBySlug(slug: string) {
  return listings.find((listing) => listing.slug === slug);
}
