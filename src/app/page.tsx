import Link from "next/link";
import { AppSidebar } from "@/components/sidebar/sidebar";

export default function HomePage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh" }}>
      <AppSidebar />
      <section style={{ padding: "1.25rem", color: "#f9fafb" }}>
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
