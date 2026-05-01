import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "./stays-list.module.css";
import { getListings } from "./stays-data";
import { StaysListClient } from "./stays-list-client";

export default async function HotelsAndAirbnbsPage() {
  const listings = await getListings();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <StaysListClient listings={listings} />
      </section>
    </main>
  );
}
