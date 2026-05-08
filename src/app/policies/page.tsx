import Link from "next/link";

import { policyContact, policyGroups } from "./policy-data";
import styles from "./policies.module.css";

const lastUpdated = "May 8, 2026";

const tableOfContents = policyGroups.map(({ id, title }) => ({ id, title }));

export default function PoliciesPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Link href="/welcome" className={styles.backLink}>
          ← Back to BareUnity
        </Link>
        <p className={styles.kicker}>BareUnity legal center</p>
        <h1>Privacy, Terms, Community Rules & Protective Policies</h1>
        <p className={styles.lede}>
          A comprehensive policy hub for an adult-only, consent-first naturist community. Last updated {lastUpdated}.
        </p>
        <div className={styles.notice}>
          <strong>Important:</strong> No template can “cover everything” in every country or dispute. This is a broad,
          owner-protective operational draft, not legal advice. Have a qualified lawyer adapt it to your entity,
          jurisdiction, vendors, insurance, contact details, and launch market before publishing.
        </div>
        <div className={styles.contactPanel}>
          <p>
            <strong>Official legal name:</strong> {policyContact.legalName}
          </p>
          <p>
            <strong>Domain/trading name:</strong> {policyContact.domain}
          </p>
          <p>
            <strong>All policy, privacy, safety, copyright, accessibility, and legal contact:</strong>{" "}
            <a href={`mailto:${policyContact.email}`}>{policyContact.email}</a>
          </p>
        </div>
      </section>

      <nav className={styles.toc} aria-label="Policy pages">
        {tableOfContents.map((item) => (
          <Link key={item.id} href={`/policies/${item.id}`}>
            {item.title}
          </Link>
        ))}
      </nav>

      <section className={styles.content}>
        {policyGroups.map((group) => (
          <article key={group.id} id={group.id} className={styles.policyCard}>
            <p className={styles.eyebrow}>{group.eyebrow}</p>
            <h2>{group.title}</h2>
            <div className={styles.bodyText}>
              {group.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ul className={styles.checklist}>
              {group.cards.map((card) => (
                <li key={card}>{card}</li>
              ))}
            </ul>
            <Link className={styles.policyPageLink} href={`/policies/${group.id}`}>
              Open the full {group.title} page →
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}