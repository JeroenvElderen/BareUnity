import { AdminBookingListingManager } from "@/components/admin/admin-booking-listing-manager";

const ACTIVITY_TYPES = ["Class", "Workshop", "Excursion", "Event", "Retreat"];

export default function AdminActivitiesPage() {
  return (
    <AdminBookingListingManager
      category="activities"
      importCategory="activity"
      title="Activity listing manager"
      subtitle="Import activity and event details from public websites, review policies and requirements, then publish rich activity listings."
      listingTypes={ACTIVITY_TYPES}
      defaultType="Event"
      defaultBadge="Website-sourced activity"
      defaultVibe="Naturist-friendly experience"
      defaultCheckInWindow="Check the activity website for current schedule"
      viewPath="/bookings/activities"
      saveLabel="activity listing"
    />
  );
}
