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
const serviceHighlights = ["Reception 24h", "TV in the room", "Luggage rack", "Restaurant", "Bath", "Accessibility", "Laundry service", "Cafe-Bar", "Safe", "Garden"];
const serviceColumns = {
  Room: ["Panoramic views", "Minibar", "Flat screen TV", "Closet", "Coat rack", "Linens"],
  "Food and drink": ["Coffee", "Fruit", "Wine - Champagne", "Snackbar", "Restaurant"],
  Security: ["Extinguisher", "Security cameras", "Smoke detectors", "Security alarm", "Access key 24 hour security", "Safe"],
};

const roomCards = [
  { title: "Standard room", price: 56, perks: ["Full bed", "2 Guests", "Balcony", "Air conditioning"] },
  { title: "Premium room with views", price: 270, perks: ["Full bed", "Breakfast included", "2 Guests", "Free amenities", "Balcony", "Air conditioning"] },
  { title: "Luxury room with views and jacuzzi", price: 310, perks: ["Full bed", "Breakfast included", "2 Guests", "Free amenities", "Balcony", "Late check out", "Air conditioning", "Jacuzzi"] },
];

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
          <nav className={styles.breadcrumbs}><Link href="/">Home</Link><span>›</span><Link href="/bookings/hotels-airbnbs">Search results</Link><span>›</span><p>{listing.name}</p></nav>
          <header className={styles.titleBarModern}><div><h1>{listing.name}</h1><p className={styles.stars}>★★★</p><p className={styles.addressLine}>{listing.address}</p></div><button className={styles.saveBtn} type="button">Save ♥</button></header>

          <section className={styles.galleryModern}>
            {galleryItems.map((imageUrl, idx) => (
              <figure key={`${imageUrl}-${idx}`} className={idx === 0 ? styles.heroPhoto : styles.subPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={`${listing.name} photo ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} />
              </figure>
            ))}
          </section>

          <div className={styles.tabsMock}><span className={styles.activeTab}>Description</span><span>Services</span><span>Rooms</span><span>Comments</span><span>Policy</span></div>

          <section className={styles.descriptionBlock}>
            <article><h2>Description</h2><p>{listing.description}</p><p>{listing.vibe}</p></article>
            <aside className={styles.ratingCard}><h3>Rating</h3><div><strong>{listing.rating.toFixed(1)}</strong><p>Good</p><span>{listing.reviews.toLocaleString()} verified user ratings</span></div></aside>
          </section>

          <section className={styles.servicesBlock}>
            <h2>Services</h2>
            <div className={styles.serviceHighlights}>{serviceHighlights.map((item) => <p key={item}>{item}</p>)}</div>
            <div className={styles.serviceColumns}>{Object.entries(serviceColumns).map(([heading, items]) => <article key={heading}><h3>{heading}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div>
          </section>

          <section className={styles.roomsBlock}>
            <h2>Rooms</h2>
            <div className={styles.roomSearch}><input defaultValue="05/11/2026" aria-label="Check in" /><input defaultValue="05/13/2026" aria-label="Check out" /><input defaultValue="2 Adults · 0 Children" aria-label="Guests" /><button type="button">Search</button></div>
            <div className={styles.roomGrid}>
              {roomCards.map((room, idx) => (
                <article key={room.title} className={styles.roomCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={listing.gallery[idx + 1] ?? listing.gallery[0]} alt={room.title} loading="lazy" />
                  <div><h3>{room.title}</h3><p>Taxes included</p><ul>{room.perks.map((perk) => <li key={perk}>{perk}</li>)}</ul><p className={styles.roomPrice}>$ {room.price} night</p><a href={listing.websiteUrl} target="_blank" rel="noreferrer">Book</a></div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.commentsBlock}>
            <h2>Comments and ratings</h2>
            <p className={styles.commentScore}><strong>9.2</strong> Very good · 241 ratings</p>
            <div className={styles.commentBars}>{["Cleanliness", "Location", "Transfers", "Facilities", "Staff", "Accessibility", "Comfort", "WiFi", "Food & drinks"].map((label, idx) => <div key={label}><p>{label}</p><span style={{ width: `${68 + ((idx % 3) * 15)}%` }} /></div>)}</div>
          </section>

          <section className={styles.policySection}>
            <h2>Rules and policy</h2>
            {policyItems.map((item) => <details key={item} className={styles.policyItem}><summary>{item}</summary><p>Please verify these details directly with the property partner before booking.</p></details>)}
          </section>
        </div>
      </section>
    </main>
  );
}
