import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "./hotels-airbnbs.module.css";
import { getListings } from "./stays-data";

const quickFilters = ["Oceanfront", "Pet friendly", "Workcation", "Wellness", "Flexible cancellation", "Breakfast"];

const statCards = [
  { label: "Stays found", value: "182" },
  { label: "Price sweet spot", value: "$180-$260" },
  { label: "Instant book options", value: "74" },
] as const;

export default async function HotelsAndAirbnbsPage() {
  const listings = await getListings();
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Stays</p>
              <h1>Plan one trip view for hotels, homes, and boutique escapes.</h1>
              <p className={styles.subtext}>
                Reworked to make decisions faster: compare vibe, quality score, and real total cost without opening ten
                tabs.
              </p>
            </div>

            <form className={styles.searchPanel} aria-label="Accommodation search form">
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Destination</span>
                  <input defaultValue="Barcelona" />
                </label>
                <label className={styles.field}>
                  <span>Dates</span>
                  <input defaultValue="Jun 18 - Jun 22" />
                </label>
                <label className={styles.field}>
                  <span>Travelers</span>
                  <input defaultValue="2 adults · 1 room" />
                </label>
                <label className={styles.field}>
                  <span>Budget / night</span>
                  <input defaultValue="$150-$300" />
                </label>
              </div>

              <div className={styles.actionsRow}>
                <button type="button" className={styles.searchButton}>
                  Update results
                </button>
                <p>Live pricing with taxes + fees preview</p>
              </div>
            </form>

            <div className={styles.statStrip}>
              {statCards.map((stat) => (
                <article key={stat.label} className={styles.statCard}>
                  <p>{stat.label}</p>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>
          </header>

          <section className={styles.quickFilters} aria-label="Quick stay styles">
            {quickFilters.map((chip) => (
              <button key={chip} type="button" className={styles.chip}>
                {chip}
              </button>
            ))}
          </section>

          <section className={styles.content}>
            <aside className={styles.filtersCard} aria-label="Property filters">
              <div className={styles.filtersHeader}>
                <h2>Trip filters</h2>
                <button type="button">Clear</button>
              </div>

              <div className={styles.filterGroup}>
                <h3>Stay type</h3>
                <label>
                  <input type="checkbox" defaultChecked /> Hotels
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Entire homes
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Boutique stays
                </label>
              </div>

              <div className={styles.filterGroup}>
                <h3>Amenities</h3>
                <label>
                  <input type="checkbox" defaultChecked /> Flexible cancellation
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Fast Wi-Fi
                </label>
                <label>
                  <input type="checkbox" /> Kitchen
                </label>
                <label>
                  <input type="checkbox" /> Parking
                </label>
              </div>

              <div className={styles.filterGroup}>
                <h3>Guest rating</h3>
                <p>Excellent 8.5+ and above</p>
              </div>
            </aside>

            <div className={styles.resultsColumn}>
              <div className={styles.resultsTopBar}>
                <p>182 stays · sorted for value and location fit</p>
                <button type="button">Map view</button>
              </div>

              {listings.map((listing) => (
                <article key={listing.name} className={styles.listingCard}>
                  <div className={styles.listingMedia} aria-hidden="true">
                    <span>{listing.type}</span>
                  </div>

                  <div className={styles.listingBody}>
                    <div className={styles.listingHeader}>
                      <div>
                        <p className={styles.location}>{listing.location}</p>
                        <h3>{listing.name}</h3>
                        <p className={styles.vibe}>{listing.vibe}</p>
                        <p className={styles.badge}>{listing.badge}</p>
                      </div>
                      <div className={styles.score}>
                        <strong>{listing.rating}</strong>
                        <span>{listing.reviews} reviews</span>
                      </div>
                    </div>

                    <ul className={styles.amenities}>
                      {listing.amenities.map((amenity) => (
                        <li key={amenity}>{amenity}</li>
                      ))}
                    </ul>

                    <div className={styles.listingFooter}>
                      <p>
                        from <strong>${listing.price}</strong> / night · ${listing.price * listing.nights} total
                      </p>
                      <Link href={`/bookings/hotels-airbnbs/${listing.slug}`} className={styles.detailsLink}>See stay details</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
