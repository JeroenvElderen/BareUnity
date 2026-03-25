import { BookingCategoryTemplate } from "@/components/bookings/booking-category-template";

const templates = [
  "Activity listing with skill/intensity filters",
  "Event detail with host profile and requirements",
  "Seat reservation + waitlist template",
  "Group booking and itinerary summary",
] as const;

export default function ActivitiesPage() {
  return (
    <BookingCategoryTemplate
      title="Activities"
      description="Template space for excursions, events, classes, and group itineraries."
      templates={templates}
    />
  );
}