import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "@/app/bookings/hotels-airbnbs/stays-list.module.css";
import { BookingListingsClient } from "@/components/bookings/booking-listings-client";
import { getSpaListings } from "./spas-data";

export default async function SpasPage() {
  const listings = await getSpaListings();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />
      <section className={styles.page}>
        <BookingListingsClient
          listings={listings}
          apiPath="/api/bookings/spas"
          title="Spas & Wellness"
          subtitle="Compare wellness centers, massage studios, thermal spas, and restorative naturist-friendly treatments."
          requestType="spa"
          requestLabel="Request a spa"
          priceLabel="/ treatment"
        />
      </section>
    </main>
  );
}
