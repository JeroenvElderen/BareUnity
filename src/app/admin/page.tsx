import Link from "next/link";
import styles from "./page.module.css";

const sections = [
  {
    title: "Verification applications",
    description: "Review onboarding applications and approve or reject new members.",
    href: "/admin/applications",
    cta: "Open applications",
  },
  {
    title: "User reports",
    description: "Track flagged posts and comments that need moderation follow-up.",
    href: "/admin/reports",
    cta: "Open reports",
  },
  {
    title: "Manual user creation",
    description: "Create new users directly in Supabase auth + profiles, restricted to your owner account.",
    href: "/admin/users",
    cta: "Create users",
  },
  {
    title: "Stay listing manager",
    description: "Add hotels, campings, and resorts without redeploying by writing directly to the stays data store.",
    href: "/admin/stays",
    cta: "Add stay",
  },
];

export default function AdminOverviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.eyebrow}>Admin Studio</p>
        <h1 className={styles.title}>BareUnity Admin Control Center</h1>
        <p className={styles.subtitle}>
          Use this workspace to keep the community safe, process onboarding, and stay on top of flagged content.
        </p>

        <div className={styles.grid}>
          {sections.map((section) => (
            <article key={section.title} className={styles.card}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              <Link href={section.href}>{section.cta}</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}