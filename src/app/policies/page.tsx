import Link from "next/link";

import { policyContact, policyGroups } from "./policy-data";
import styles from "./policies.module.css";

const lastUpdated = "May 8, 2026";

const tableOfContents = policyGroups.map(({ id, title }) => ({ id, title }));

export default function PoliciesPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <Link href="/welcome" className={styles.backLink}>
            ← Back to BareUnity
          </Link>
          <span className={styles.lastUpdatedBadge}>Last updated {lastUpdated}</span>
        </div>
        <p className={styles.kicker}>BareUnity legal center</p>
        <h1>Complete Privacy, Terms, Community Rules & Safety Policies</h1>
        <p className={styles.lede}>
          The current, expanded rules for using BareUnity as an adult-only, consent-first naturist community.
        </p>
        <div className={styles.heroGrid}>
          <div className={styles.notice}>
            <strong>Important:</strong> These expanded policies explain the rules that apply when members use BareUnity, including privacy,
            verification, consent, content, discussion, offline safety, venue discovery, payments, enforcement, and legal
            requests. They may be updated as features, safety practices, vendors, or legal requirements change.
          </div>
          <div className={styles.quickFacts} aria-label="Policy center highlights">
            <div className={styles.quickFact}>
              <strong>{policyGroups.length}</strong>
              <span>Policy areas covering community operations</span>
            </div>
            <div className={styles.quickFact}>
              <strong>18+</strong>
              <span>Adult-only, consent-first membership standard</span>
            </div>
          </div>
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

      <section className={styles.sectionIntro} aria-labelledby="policy-library-heading">
        <p className={styles.kicker}>Policy library</p>
        <h2 id="policy-library-heading">Review each policy area</h2>
        <p>
          Each section summarizes the standards members, visitors, venues, and service providers should understand before
          using BareUnity. Open a dedicated page for more focused reading.
        </p>
      </section>

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