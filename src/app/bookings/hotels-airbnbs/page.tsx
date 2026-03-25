import { BookingCategoryTemplate } from "@/components/bookings/booking-category-template";

const templates = [
  "Hotel/Airbnb search filters (dates, guests, private/shared stay)",
  "Property card grid with quick compare drawer",
  "Room/unit detail with policies and host highlights",
  "Booking confirmation and check-in instructions",
] as const;

export default function HotelsAndAirbnbsPage() {
  return (
    <BookingCategoryTemplate
      title="Hotels & Airbnbs"
      description="Template space for accommodation-first booking flows and stay comparison UX."
      templates={templates}
    />
  );
}