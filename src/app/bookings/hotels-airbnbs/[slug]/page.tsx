import Link from "next/link";
import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "../hotels-airbnbs.module.css";
import { getListingBySlug } from "../stays-data";

type StayDetailsPageProps = {
  params: Promise<{ slug: string }>;
};

const policyItems = ["Check-in and check-out", "Cancellation", "Accepted payment methods", "Hotel policy", "Security", "Pets"];

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
          <header className={styles.titleBarModern}><div><p className={styles.badgePill}>{listing.badge}</p><h1>{listing.name}</h1><p className={styles.addressLine}>{listing.address}</p><p className={styles.vibeText}>{listing.vibe}</p><div className={styles.quickMeta}><span>{listing.type}</span><span>{listing.location}</span><span>{listing.rating.toFixed(1)} rating</span></div></div><a className={styles.bookNowBtn} href={listing.websiteUrl} target="_blank" rel="noreferrer">Book now</a></header>

          <section className={styles.galleryModern}>
            {galleryItems.map((imageUrl, idx) => (
              <figure key={`${imageUrl}-${idx}`} className={idx === 0 ? styles.heroPhoto : styles.subPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={`${listing.name} photo ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} />
              </figure>
            ))}
          </section>

          <section className={styles.descriptionBlock}>
            <article>
              <h2>About this stay</h2>
              <p>{listing.description}</p>
            </article>
            <aside className={styles.ratingCard}><h3>Guest rating</h3><div><strong>{listing.rating.toFixed(1)}</strong><p>{listing.reviews.toLocaleString()} verified ratings</p></div></aside>
          </section>

          <section className={styles.servicesBlock}>
            <h2>Top amenities</h2>
            <ul className={styles.amenitiesList}>{listing.amenities.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className={styles.policySection}>
            <h2>Property policies</h2>
            {policyItems.map((item) => <details key={item} className={styles.policyItem}><summary>{item}</summary><p>Please verify these details directly with the property partner before booking.</p></details>)}
          </section>
        </div>
      </section>
    </main>
  );
}
