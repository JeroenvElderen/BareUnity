import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

export type Listing = {
  slug: string;
  name: string;
  location: string;
  type: "Hotel" | "Entire place" | "Boutique stay";
  rating: number;
  reviews: number;
  price: number;
  nights: number;
  badge: string;
  vibe: string;
  amenities: string[];
  description: string;
  websiteUrl: string;
  address: string;
  checkInWindow: string;
};

export const fallbackListings: Listing[] = [
  {
    slug: "harbor-light-suites",
    name: "Harbor Light Suites",
    location: "San Diego · Waterfront",
    type: "Hotel",
    rating: 9.1,
    reviews: 842,
    price: 248,
    nights: 4,
    badge: "Best value",
    vibe: "Resort energy · Morning yoga · Sunset terrace",
    amenities: ["Dogs allowed", "Private bathroom", "Toiletries", "Breakfast included", "Free cancellation", "Ocean-view suites"],
    description:
      "Modern suites steps from the marina with flexible cancellation and an easy walk to dining, tours, and coastal bike paths.",
    websiteUrl: "https://www.example.com/harbor-light-suites",
    address: "145 Harbor View Dr, San Diego, CA",
    checkInWindow: "Check-in 3:00 PM · Check-out 11:00 AM",
  },
  {
    slug: "sage-loft-by-the-park",
    name: "Sage Loft by the Park",
    location: "Austin · Zilker",
    type: "Entire place",
    rating: 4.88,
    reviews: 167,
    price: 192,
    nights: 4,
    badge: "Guest favorite",
    vibe: "Quiet block · Walkable coffee shops · Remote-work setup",
    amenities: ["Dogs allowed", "Full bathroom", "Kitchen", "Self check-in", "Workspace", "Superhost"],
    description:
      "Bright private loft with neighborhood charm, strong Wi-Fi, and a calm setup ideal for blended work + weekend travel.",
    websiteUrl: "https://www.example.com/sage-loft-by-the-park",
    address: "212 Barton Springs Rd, Austin, TX",
    checkInWindow: "Check-in 4:00 PM · Check-out 10:00 AM",
  },
  {
    slug: "palm-courtyard-retreat",
    name: "Palm Courtyard Retreat",
    location: "Miami · South Beach",
    type: "Boutique stay",
    rating: 8.7,
    reviews: 513,
    price: 276,
    nights: 4,
    badge: "Free airport transfer",
    vibe: "Design-forward rooms · Spa package · Rooftop lounge",
    amenities: ["Pool", "Spa bathroom", "Toiletries", "Late checkout", "Pay at property"],
    description:
      "Stylish boutique stay with spa-ready amenities, rooftop social spaces, and optional transfer perks for smooth arrivals.",
    websiteUrl: "https://www.example.com/palm-courtyard-retreat",
    address: "55 Collins Ave, Miami Beach, FL",
    checkInWindow: "Check-in 3:00 PM · Check-out 11:00 AM",
  },
];

function toListing(row: Record<string, unknown>): Listing {
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    location: String(row.location ?? ""),
    type: (row.type as Listing["type"]) ?? "Hotel",
    rating: Number(row.rating ?? 0),
    reviews: Number(row.reviews ?? 0),
    price: Number(row.price ?? 0),
    nights: Number(row.nights ?? 1),
    badge: String(row.badge ?? ""),
    vibe: String(row.vibe ?? ""),
    amenities: Array.isArray(row.amenities) ? row.amenities.map(String) : Array.isArray(row.perks) ? row.perks.map(String) : [],
    description: String(row.description ?? ""),
    websiteUrl: String(row.website_url ?? ""),
    address: String(row.address ?? ""),
    checkInWindow: String(row.check_in_window ?? ""),
  };
}

export async function getListings() {
  if (!isSupabaseAdminConfigured) return fallbackListings;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("stays").select("*").order("name");
    if (error || !data?.length) return fallbackListings;
    return data.map((row) => toListing(row));
  } catch {
    return fallbackListings;
  }
}

export async function getListingBySlug(slug: string) {
  const listings = await getListings();
  return listings.find((listing) => listing.slug === slug);
}
