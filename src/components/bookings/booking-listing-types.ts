export type BookingListing = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: string;
  rating: number;
  price: number;
  badge: string;
  vibe: string;
  amenities: string[];
  description: string;
  websiteUrl: string;
  address: string;
  mapLatitude?: number;
  mapLongitude?: number;
  checkInWindow: string;
  gallery: string[];
  policies: Array<{
    category: string;
    items: string[];
  }>;
};
