import { AdminBookingListingManager } from "@/components/admin/admin-booking-listing-manager";

const SPA_TYPES = [
  "Day spa",
  "Wellness center",
  "Thermal spa",
  "Massage studio",
];

export default function AdminSpasPage() {
  return (
    <AdminBookingListingManager
      category="spas"
      importCategory="spa"
      title="Spa listing manager"
      subtitle="Import spa and wellness details from public websites, review policies and booking notes, then publish rich spa listings."
      listingTypes={SPA_TYPES}
      defaultType="Day spa"
      defaultBadge="Website-sourced spa"
      defaultVibe="Naturist-friendly wellness"
      defaultCheckInWindow="Check the spa website for treatment availability"
      viewPath="/bookings/spas"
      saveLabel="spa listing"
    />
  );
}
