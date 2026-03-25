import { BookingCategoryTemplate } from "@/components/bookings/booking-category-template";

const templates = [
  "Resort overview with package tiers",
  "Amenity matrix (pool, beach, wellness, dining)",
  "Resort activity scheduler tied to stay dates",
  "Deposit + installment checkout template",
] as const;

export default function ResortsPage() {
  return (
    <BookingCategoryTemplate
      title="Resorts"
      description="Template space for full-resort discovery, package booking, and bundled experiences."
      templates={templates}
    />
  );
}