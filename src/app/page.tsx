import { AppSidebar } from "@/components/sidebar/sidebar";

export default function HomePage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh" }}>
      <AppSidebar />
      <section style={{ padding: "1.25rem", color: "#f9fafb" }}>
        <h2>Content area</h2>
        <p>Starting fresh: next component comes after sidebar approval.</p>
      </section>
    </main>
  );
}
