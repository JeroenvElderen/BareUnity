import Link from "next/link";
import { FloatingSidebarProfileLink } from "@/components/sidebar/profile-link";
import { AppSidebar } from "@/components/sidebar/sidebar";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <AppSidebar />
      <FloatingSidebarProfileLink />
      <section className={styles.content}>
        <h2>Content area</h2>
        <p>Starting fresh: next component comes after sidebar approval.</p>
        <p>
          Auth screens preview: <Link href="/login">Login</Link> ·{" "}
          <Link href="/register">Register</Link> · {" "}
          <Link href="/profile">Profile examples</Link>
        </p>
      </section>
    </main>
  );
}
