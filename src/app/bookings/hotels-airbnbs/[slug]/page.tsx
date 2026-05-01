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

  const galleryItems = listing.gallery.slice(0, 5);

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />
      <section className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.titleBar}>
            <div>
              <h1>{listing.name}</h1>
              <p className={styles.addressLine}>{listing.location} · {listing.address}</p>
            </div>
            <div className={styles.scoreBlock}>
              <p>Exceptional</p>
              <strong>{listing.rating.toFixed(1)}</strong>
              <span>{listing.reviews.toLocaleString()} reviews</span>
            </div>
          </header>

          <article className={styles.galleryCard}>
            <div className={styles.galleryGrid}>
              {galleryItems.map((imageUrl, idx) => (
                <figure key={`${imageUrl}-${idx}`} className={idx === 0 ? styles.galleryMain : styles.galleryThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={`${listing.name} photo ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} />
                </figure>
              ))}
            </div>
          </article>

          <section className={styles.detailsLayout}>
            <article className={styles.listingCard}>
              <div className={styles.listingBody}>
                <p className={styles.badge}>{listing.badge}</p>
                <h2>About this property</h2>
                <p className={styles.subtext}>{listing.description}</p>
                <p className={styles.vibe}>{listing.vibe}</p>

                <div className={styles.metaGrid}>
                  <article className={styles.metaItem}><p>Property type</p><strong>{listing.type}</strong></article>
                  <article className={styles.metaItem}><p>Check-in</p><strong>{listing.checkInWindow}</strong></article>
                  <article className={styles.metaItem}><p>Length of stay</p><strong>{listing.nights} nights</strong></article>
                </div>

                <h3>Amenities</h3>
                <ul className={styles.amenities}>
                  {listing.amenities.map((amenity) => (
                    <li key={amenity}>{amenity}</li>
                  ))}
                </ul>
              </div>
            </article>

            <aside className={styles.bookingCard}>
              <p className={styles.bookingTitle}>Book on partner website</p>
              <p className={styles.bookingPrice}>${listing.price} <span>/ night</span></p>
              <p className={styles.partnerNote}>You will complete booking and payment directly with the property partner.</p>
              <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className={styles.primaryAction}>Check availability on partner site</a>
              <Link href="/bookings/hotels-airbnbs" className={styles.secondaryAction}>Back to stays</Link>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
