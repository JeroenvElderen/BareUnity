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

function getRatingTone(rating: number) {
  if (rating >= 4.8) return "Exceptional";
  if (rating >= 4.5) return "Outstanding";
  if (rating >= 4.0) return "Excellent";
  return "Great";
}

export default async function StayDetailsPage({
  params,
}: StayDetailsPageProps) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const galleryItems = listing.gallery.slice(0, 5);

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />
      <section className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.titleBarModern}>
            <div>
              <p className={styles.badgePill}>{listing.badge}</p>
              <h1>{listing.name}</h1>
              <p className={styles.addressLine}>{listing.address}</p>
              <p className={styles.vibeText}>{listing.vibe}</p>
              <div className={styles.quickMeta}>
                <span>{listing.type}</span>
                <span>
                  {listing.placeName}, {listing.country}
                </span>
                <span>★ {listing.rating.toFixed(1)} · {getRatingTone(listing.rating)}</span>
              </div>
            </div>
            <a
              className={styles.bookNowBtn}
              href={listing.websiteUrl}
              target="_blank"
              rel="noreferrer"
            >
              Book now
            </a>
          </header>

          <section className={styles.galleryModern}>
            {galleryItems.map((imageUrl, idx) => (
              <figure
                key={`${imageUrl}-${idx}`}
                className={idx === 0 ? styles.heroPhoto : styles.subPhoto}
              >
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.photoLink}
                  aria-label={`Open full size photo ${idx + 1} for ${listing.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={`${listing.name} photo ${idx + 1}`}
                    loading={idx === 0 ? "eager" : "lazy"}
                  />
                </a>
              </figure>
            ))}
          </section>

          <section className={styles.descriptionBlock}>
            <article>
              <h2>About this stay</h2>
              <p>{listing.description}</p>
            </article>
            <aside className={styles.ratingCard}>
              <h3>Guest rating</h3>
              <div className={styles.ratingSummary}>
                <p className={styles.ratingTone}>{getRatingTone(listing.rating)}</p>
                <strong>★ {listing.rating.toFixed(1)}</strong>
                <p>{listing.reviews.toLocaleString()} verified ratings</p>
              </div>
            </aside>
          </section>

          <section className={styles.servicesBlock}>
            <h2>Top amenities</h2>
            <ul className={styles.amenitiesList}>
              {listing.amenities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={styles.policySection}>
            <div className={styles.policyHeader}>
              <h2>Property policies</h2>
              <p>
                Everything to know before arrival, organized into quick sections
                for easier planning.
              </p>
            </div>

            <div className={styles.policyGrid}>
              {listing.policies.map((policy) => (
                <article key={policy.category} className={styles.policyCategory}>
                  <h3 className={styles.policySummary}>{policy.category}</h3>

                  <ul className={styles.policyList}>
                    {policy.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
