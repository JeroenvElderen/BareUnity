import { BookingCategoryTemplate } from "@/components/bookings/booking-category-template";

const templates = [
  "Spa directory with treatment filters",
  "Service detail template (duration, pricing, prep notes)",
  "Therapist availability and slot picker",
  "Wellness pass checkout with add-ons",
] as const;

export default function SpasPage() {
  return (
    <BookingCategoryTemplate
      title="Spas & Wellness"
      description="Template space for treatment-led booking journeys, therapist scheduling, and wellness passes."
      templates={templates}
    />
  );
}