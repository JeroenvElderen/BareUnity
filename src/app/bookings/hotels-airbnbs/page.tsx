import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "./hotels-airbnbs.module.css";

type Listing = {
  name: string;
  location: string;
  type: "Hotel" | "Entire place" | "Boutique stay";
  rating: number;
  reviews: number;
  price: number;
  nights: number;
  badge: string;
  perks: string[];
};

const listings: Listing[] = [
  {
    name: "Harbor Light Suites",
    location: "San Diego · Waterfront",
    type: "Hotel",
    rating: 9.1,
    reviews: 842,
    price: 248,
    nights: 4,
    badge: "Best value",
    perks: ["Breakfast included", "Free cancellation", "Ocean-view suites"],
  },
  {
    name: "Sage Loft by the Park",
    location: "Austin · Zilker",
    type: "Entire place",
    rating: 4.88,
    reviews: 167,
    price: 192,
    nights: 4,
    badge: "Guest favorite",
    perks: ["Self check-in", "Workspace", "Superhost"],
  },
  {
    name: "Palm Courtyard Retreat",
    location: "Miami · South Beach",
    type: "Boutique stay",
    rating: 8.7,
    reviews: 513,
    price: 276,
    nights: 4,
    badge: "Free airport transfer",
    perks: ["Resort pool", "Late checkout", "Pay at property"],
  },
];

const quickFilters = [
  "Beachfront",
  "Family friendly",
  "Remote-work ready",
  "Breakfast included",
  "Free cancellation",
  "Pet friendly",
];

const statCards = [
  { label: "Stays found", value: "182" },
  { label: "Under $250/night", value: "96" },
  { label: "Top-rated 9+", value: "41" },
] as const;

export default function HotelsAndAirbnbsPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Hotels + Homes</p>
              <h1>Find beautiful stays with hotel confidence and Airbnb charm.</h1>
              <p className={styles.subtext}>
                One search flow for verified hotels, unique homes, and boutique experiences. Compare quality scores,
                cancellation flexibility, and transparent total price.
              </p>
            </div>

            <form className={styles.searchPanel} aria-label="Accommodation search form">
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Destination</span>
                  <input defaultValue="Barcelona" />
                </label>
                <label className={styles.field}>
                  <span>Check in</span>
                  <input defaultValue="Jun 18" />
                </label>
                <label className={styles.field}>
                  <span>Check out</span>
                  <input defaultValue="Jun 22" />
                </label>
                <label className={styles.field}>
                  <span>Guests</span>
                  <input defaultValue="2 adults · 1 room" />
                </label>
              </div>

              <div className={styles.actionsRow}>
                <button type="button" className={styles.searchButton}>
                  Search stays
                </button>
                <p>Updated just now · taxes and fees preview included</p>
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
                <h2>Filters</h2>
                <button type="button">Reset</button>
              </div>

              <div className={styles.filterGroup}>
                <h3>Property type</h3>
                <label>
                  <input type="checkbox" defaultChecked /> Hotels
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Entire homes
                </label>
                <label>
                  <input type="checkbox" /> Shared rooms
                </label>
              </div>

              <div className={styles.filterGroup}>
                <h3>Essentials</h3>
                <label>
                  <input type="checkbox" defaultChecked /> Free cancellation
                </label>
                <label>
                  <input type="checkbox" /> Breakfast
                </label>
                <label>
                  <input type="checkbox" defaultChecked /> Fast Wi-Fi
                </label>
                <label>
                  <input type="checkbox" /> Kitchen
                </label>
              </div>

              <div className={styles.filterGroup}>
                <h3>Price per night</h3>
                <p>$120 – $320</p>
              </div>
            </aside>

            <div className={styles.resultsColumn}>
              <div className={styles.resultsTopBar}>
                <p>182 stays · sorted by best match</p>
                <button type="button">Show map</button>
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
                        <p className={styles.badge}>{listing.badge}</p>
                      </div>
                      <div className={styles.score}>
                        <strong>{listing.rating}</strong>
                        <span>{listing.reviews} reviews</span>
                      </div>
                    </div>

                    <ul className={styles.perks}>
                      {listing.perks.map((perk) => (
                        <li key={perk}>{perk}</li>
                      ))}
                    </ul>

                    <div className={styles.listingFooter}>
                      <p>
                        from <strong>${listing.price}</strong> / night · ${listing.price * listing.nights} total
                      </p>
                      <button type="button">View details</button>
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