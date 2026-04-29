import Link from "next/link";
import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "../hotels-airbnbs.module.css";
import { getListingBySlug } from "../stays-data";

type StayDetailsPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default async function StayDetailsPage({ params }: StayDetailsPageProps) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />
      <section className={styles.page}>
        <div className={styles.shell}>
          <article className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Stay details</p>
              <h1>{listing.name}</h1>
              <p className={styles.subtext}>{listing.description}</p>
            </div>

            <div className={styles.statStrip}>
              <article className={styles.statCard}>
                <p>Location</p>
                <strong>{listing.location}</strong>
              </article>
              <article className={styles.statCard}>
                <p>Rating</p>
                <strong>{listing.rating}</strong>
              </article>
              <article className={styles.statCard}>
                <p>Price</p>
                <strong>${listing.price}/night</strong>
              </article>
            </div>
          </article>

          <section className={styles.content}>
            <aside className={styles.filtersCard}>
              <div className={styles.filterGroup}>
                <h3>Address</h3>
                <p>{listing.address}</p>
              </div>
              <div className={styles.filterGroup}>
                <h3>Timing</h3>
                <p>{listing.checkInWindow}</p>
              </div>
              <div className={styles.filterGroup}>
                <h3>Stay vibe</h3>
                <p>{listing.vibe}</p>
              </div>
            </aside>

            <div className={styles.resultsColumn}>
              <article className={styles.listingCard}>
                <div className={styles.listingBody}>
                  <div className={styles.listingHeader}>
                    <div>
                      <p className={styles.location}>{listing.type}</p>
                      <h3>Amenities</h3>
                      <p className={styles.badge}>{listing.badge}</p>
                    </div>
                  </div>

                  <ul className={styles.amenities}>
                    {(Array.isArray(listing.amenities) ? listing.amenities : []).map((amenity) => (
                      <li key={amenity}>{amenity}</li>
                    ))}
                  </ul>

                  <div className={styles.listingFooter}>
                    <Link href="/bookings/hotels-airbnbs" className={styles.detailsLink}>
                      Back to stays
                    </Link>
                    <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className={styles.detailsLink}>
                      Go to stay website
                    </a>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
