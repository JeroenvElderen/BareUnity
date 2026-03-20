import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <AppSidebar />
      <section className={styles.content}>
        <h2>Content area</h2>
        <p>Starting fresh: next component comes after sidebar approval.</p>
        <p>
          Auth screens preview: <Link href="/login">Login</Link> ·{" "}
          <Link href="/register">Register</Link>
        </p>
      </section>
    </main>
  );
}
