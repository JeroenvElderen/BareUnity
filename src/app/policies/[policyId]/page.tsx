import Link from "next/link";
import { notFound } from "next/navigation";

import { getPolicyById, policyContact, policyGroups } from "../policy-data";
import styles from "../policies.module.css";

const lastUpdated = "May 8, 2026";

type PolicyDetailsPageProps = {
  params: Promise<{ policyId: string }>;
};

export function generateStaticParams() {
  return policyGroups.map((policy) => ({ policyId: policy.id }));
}

export async function generateMetadata({ params }: PolicyDetailsPageProps) {
  const { policyId } = await params;
  const policy = getPolicyById(policyId);

  if (!policy) {
    return {
      title: "Policy not found | BareUnity",
    };
  }

  return {
    title: `${policy.title} | BareUnity Policies`,
    description: policy.body[0],
  };
}

export default async function PolicyDetailsPage({ params }: PolicyDetailsPageProps) {
  const { policyId } = await params;
  const policy = getPolicyById(policyId);

  if (!policy) notFound();

  const relatedPolicies = policyGroups.filter((candidate) => candidate.id !== policy.id);

  return (
    <main className={styles.page}>
      <section className={`${styles.hero} ${styles.policyHero}`}>
        <Link href="/policies" className={styles.backLink}>
          ← Back to all policies
        </Link>
        <p className={styles.kicker}>{policy.eyebrow}</p>
        <h1>{policy.title}</h1>
        <p className={styles.lede}>BareUnity policy page. Last updated {lastUpdated}.</p>
        <div className={styles.contactPanel}>
          <p>
            <strong>Official legal name:</strong> {policyContact.legalName}
          </p>
          <p>
            <strong>Domain/trading name:</strong> {policyContact.domain}
          </p>
          <p>
            <strong>All contact:</strong> <a href={`mailto:${policyContact.email}`}>{policyContact.email}</a>
          </p>
        </div>
      </section>

      <section className={styles.content}>
        <article className={`${styles.policyCard} ${styles.standalonePolicyCard}`}>
          <p className={styles.eyebrow}>{policy.eyebrow}</p>
          <h2>{policy.title}</h2>
          <div className={styles.bodyText}>
            {policy.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <ul className={styles.checklist}>
            {policy.cards.map((card) => (
              <li key={card}>{card}</li>
            ))}
          </ul>
          <div className={styles.notice}>
            <strong>Need help with this policy?</strong> Email BareUnity at{" "}
            <a href={`mailto:${policyContact.email}`}>{policyContact.email}</a> with privacy, safety, moderation,
            copyright, accessibility, billing, venue listing, enforcement appeal, or legal questions.
          </div>
        </article>

        <aside className={styles.relatedPolicies} aria-label="Other policy pages">
          <h2>Other policy pages</h2>
          <div>
            {relatedPolicies.map((item) => (
              <Link key={item.id} href={`/policies/${item.id}`}>
                {item.title}
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}