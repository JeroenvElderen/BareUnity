import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "./stays-list.module.css";
import { getListings } from "./stays-data";

export default async function HotelsAndAirbnbsPage() {
  const listings = await getListings();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.breadcrumb}>Home &gt; Search results</p>

          <form className={styles.searchRow} aria-label="Accommodation search form">
            <label className={styles.field}><span>Destination</span><input defaultValue="Miami" /></label>
            <label className={styles.field}><span>Check in</span><input defaultValue="05/11/2026" /></label>
            <label className={styles.field}><span>Check out</span><input defaultValue="05/13/2026" /></label>
            <label className={styles.field}><span>Guests</span><input defaultValue="2 Adults · 0 Children" /></label>
            <button type="button" className={styles.searchButton}>Search</button>
          </form>

          <section className={styles.content}>
            <aside className={styles.filters}>
              <div className={styles.filterCard}>
                <h2>Filter by:</h2>
                <div className={styles.filterGroup}>
                  <h3>Rating</h3>
                  <label><input type="radio" name="rating" defaultChecked /> All</label>
                  <label><input type="radio" name="rating" /> 9 or more · Wonderful</label>
                  <label><input type="radio" name="rating" /> 8 Very good</label>
                  <label><input type="radio" name="rating" /> 7 Good</label>
                </div>
                <div className={styles.filterGroup}>
                  <h3>Type of stay</h3>
                  <label><input type="checkbox" defaultChecked /> Hotels</label>
                  <label><input type="checkbox" defaultChecked /> Resorts</label>
                  <label><input type="checkbox" /> Apartments</label>
                </div>
              </div>
            </aside>

            <div>
              <div className={styles.resultsTop}>
                <h2>Properties found</h2>
                <select defaultValue="">
                  <option value="" disabled>Sort by</option>
                  <option value="rating">Highest rating</option>
                  <option value="price-low">Price: low to high</option>
                </select>
              </div>

              <div className={styles.results}>
                {listings.map((listing, idx) => (
                  <article key={listing.slug} className={styles.card}>
                    <div
                      className={styles.media}
                      style={{ backgroundImage: `url(${listing.gallery[0] ?? `https://picsum.photos/seed/${idx}/900/600`})` }}
                      aria-hidden="true"
                    />

                    <div className={styles.body}>
                      <div className={styles.topline}>
                        <div>
                          <h3 className={styles.name}>{listing.name}</h3>
                          <p className={styles.location}>{listing.location}</p>
                          <p className={styles.vibe}>{listing.vibe}</p>
                        </div>
                        <p className={styles.rating}><strong>{listing.rating.toFixed(1)}</strong><br />{listing.reviews} ratings</p>
                      </div>
                      
                    <ul className={styles.amenities}>
                        {listing.amenities.slice(0, 4).map((amenity) => (
                          <li key={amenity}>{amenity}</li>
                        ))}
                      </ul>

                      <div className={styles.bottom}>
                        <p className={styles.price}>${listing.price} <span>/ night</span></p>
                        <div className={styles.actions}>
                          <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className={styles.bookBtn}>Book</a>
                          <Link href={`/bookings/hotels-airbnbs/${listing.slug}`} className={styles.detailsBtn}>See more details</Link>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
