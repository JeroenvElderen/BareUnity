import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "../page.module.css";
import styles from "./bookings.module.css";

const categories = [
  {
    title: "Stays (Hotels, BnBs, Resorts, Campings)",
    description: "Unified stay booking for hotels, bnbs, resorts, and campings.",
    href: "/bookings/hotels-airbnbs",
  },
  {
    title: "Spas & Wellness",
    description: "Treatment/service booking templates and slot scheduling.",
    href: "/bookings/spas",
  },
  {
    title: "Activities",
    description: "Event and experience booking templates for individuals or groups.",
    href: "/bookings/activities",
  },
] as const;

export default function BookingsPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.main}>
        <div className={styles.container}>
          <header className={styles.hero}>
            <h1>Bookings Hub</h1>
            <p>
              Category templates are split out so we can evolve each booking journey independently before connecting
              real data and payments.
            </p>
          </header>

          <section className={styles.grid} aria-label="Booking categories">
            {categories.map((category) => (
              <article key={category.title} className={styles.card}>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
                <Link href={category.href} className={styles.link}>
                  Open template
                </Link>
              </article>
            ))}
          </section>

          <p className={styles.note}>Next: add mocked data contracts per category and shared reservation primitives.</p>
        </div>
      </section>
    </main>
  );
}