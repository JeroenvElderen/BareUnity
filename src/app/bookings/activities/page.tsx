import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "@/app/bookings/hotels-airbnbs/stays-list.module.css";
import { BookingListingsClient } from "@/components/bookings/booking-listings-client";
import { getActivityListings } from "./activities-data";

export default async function ActivitiesPage() {
  const listings = await getActivityListings();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />
      <section className={styles.page}>
        <BookingListingsClient
          listings={listings}
          apiPath="/api/bookings/activities"
          title="Activities"
          subtitle="Discover classes, workshops, excursions, events, and group experiences for respectful naturist community time."
          requestType="activity"
          requestLabel="Request an activity"
          priceLabel="/ person"
        />
      </section>
    </main>
  );
}
